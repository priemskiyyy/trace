import type { MappingLoss } from "src/types/MappingLoss";
import type { PrivacyPolicy } from "src/types/internal/PrivacyPolicy";
import type { Sanitized } from "src/types/internal/Sanitized";
import { assertUnreachable } from "src/utils/common/assertUnreachable";
import { isPlainObject } from "src/utils/common/isPlainObject";
import { UNSAFE_PROPERTY_KEYS } from "src/utils/constants/privacy";

type Walk = {
  policy: PrivacyPolicy;
  root: string;
  ancestors: Set<object>;
  remaining: number;
  losses: MappingLoss[];
};

const OMIT = Symbol("omit");

const isRecorded = (walk: Walk, path: string, reason: MappingLoss["reason"]) =>
  walk.losses.some((loss) => loss.path === path && loss.reason === reason);

const recordLoss = (
  walk: Walk,
  path: string,
  reason: MappingLoss["reason"],
) => {
  if (isRecorded(walk, path, reason)) {
    return;
  }

  if (walk.losses.length < walk.policy.limits.breadth) {
    walk.losses.push(Object.freeze({ path, reason }));

    return;
  }

  if (!isRecorded(walk, walk.root, "truncated")) {
    walk.losses.push(Object.freeze({ path: walk.root, reason: "truncated" }));
  }
};

const omit = (walk: Walk, path: string, reason: MappingLoss["reason"]) => {
  recordLoss(walk, path, reason);

  return OMIT;
};

const spendBudget = (walk: Walk, cost: number) => {
  if (cost > walk.remaining) {
    walk.remaining = 0;

    return false;
  }

  walk.remaining -= cost;

  return true;
};

const carry = (
  walk: Walk,
  path: string,
  value: unknown,
  reason: MappingLoss["reason"] | null,
) => {
  if (!spendBudget(walk, JSON.stringify(value).length)) {
    return omit(walk, path, "truncated");
  }

  if (reason !== null) {
    recordLoss(walk, path, reason);
  }

  return value;
};

// A revoked proxy throws even from Array.isArray.
const readKind = (value: object) => {
  try {
    if (Array.isArray(value)) {
      return "ARRAY";
    }
  } catch {
    return "UNREADABLE";
  }

  if (isPlainObject(value)) {
    return "PLAIN";
  }

  return "INSTANCE";
};

// The built-in getter, so it works across realms and an override on the instance never runs.
const readTime = (value: object) => {
  try {
    return Date.prototype.getTime.call(value);
  } catch {
    return null;
  }
};

const sanitizeInstance = (walk: Walk, value: object, path: string) => {
  const time = readTime(value);

  if (time === null) {
    return omit(walk, path, "unsupported");
  }

  if (!Number.isFinite(time)) {
    return omit(walk, path, "invalid");
  }

  return carry(walk, path, new Date(time).toISOString(), "coerced");
};

const readObjectDescriptors = (value: object, limit: number) => {
  try {
    const entries: [string, PropertyDescriptor][] = [];

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        continue;
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (descriptor?.enumerable !== true) {
        continue;
      }

      if (entries.length >= limit) {
        return { entries, truncated: true };
      }

      entries.push([key, descriptor]);
    }

    return { entries, truncated: false };
  } catch {
    return null;
  }
};

const readArrayDescriptors = (value: object, limit: number) => {
  try {
    const length: unknown = Object.getOwnPropertyDescriptor(
      value,
      "length",
    )?.value;

    if (typeof length !== "number") {
      return null;
    }

    return {
      length,
      items: Array.from({ length: Math.min(length, limit) }, (_, index) =>
        Object.getOwnPropertyDescriptor(value, index),
      ),
    };
  } catch {
    return null;
  }
};

const sanitizeProperty = (
  walk: Walk,
  descriptor: PropertyDescriptor | undefined,
  key: string,
  path: string,
  depth: number,
) => {
  const accessor = descriptor !== undefined && "get" in descriptor;

  if (!accessor && descriptor?.value === undefined) {
    return OMIT;
  }

  if (walk.policy.redact(key, path)) {
    return omit(walk, path, "redacted");
  }

  if (accessor) {
    return omit(walk, path, "omitted");
  }

  return sanitize(walk, descriptor?.value, path, depth + 1);
};

const sanitizeArray = (
  walk: Walk,
  value: object,
  path: string,
  depth: number,
) => {
  const read = readArrayDescriptors(value, walk.policy.limits.breadth);

  if (read === null) {
    return omit(walk, path, "invalid");
  }

  if (read.length > read.items.length) {
    recordLoss(walk, path, "truncated");
  }

  const items: unknown[] = [];

  for (const [index, descriptor] of read.items.entries()) {
    if (!spendBudget(walk, ",".length)) {
      recordLoss(walk, path, "truncated");

      break;
    }

    const sanitized = sanitizeProperty(
      walk,
      descriptor,
      String(index),
      `${path}.${index}`,
      depth,
    );

    if (sanitized !== OMIT) {
      items.push(sanitized);

      continue;
    }

    if (!spendBudget(walk, "null".length)) {
      recordLoss(walk, path, "truncated");

      break;
    }

    items.push(null);
  }

  return Object.freeze(items);
};

const sanitizeObject = (
  walk: Walk,
  value: object,
  path: string,
  depth: number,
) => {
  const read = readObjectDescriptors(value, walk.policy.limits.breadth);

  if (read === null) {
    return omit(walk, path, "invalid");
  }

  if (read.truncated) {
    recordLoss(walk, path, "truncated");
  }

  const entries: [string, unknown][] = [];

  for (const [key, descriptor] of read.entries) {
    if (UNSAFE_PROPERTY_KEYS.includes(key)) {
      recordLoss(walk, `${path}.${key}`, "omitted");

      continue;
    }

    if (!spendBudget(walk, JSON.stringify(key).length + ":,".length)) {
      recordLoss(walk, path, "truncated");

      break;
    }

    const sanitized = sanitizeProperty(
      walk,
      descriptor,
      key,
      `${path}.${key}`,
      depth,
    );

    if (sanitized !== OMIT) {
      entries.push([key, sanitized]);
    }
  }

  return Object.freeze(Object.fromEntries(entries));
};

const sanitizeContainer = (
  walk: Walk,
  value: object,
  path: string,
  depth: number,
) => {
  const kind = readKind(value);

  if (kind === "UNREADABLE") {
    return omit(walk, path, "invalid");
  }

  if (kind === "INSTANCE") {
    return sanitizeInstance(walk, value, path);
  }

  if (walk.ancestors.has(value) || depth >= walk.policy.limits.depth) {
    return omit(walk, path, "truncated");
  }

  if (!spendBudget(walk, "{}".length)) {
    return omit(walk, path, "truncated");
  }

  walk.ancestors.add(value);

  try {
    if (kind === "ARRAY") {
      return sanitizeArray(walk, value, path, depth);
    }

    if (kind === "PLAIN") {
      return sanitizeObject(walk, value, path, depth);
    }

    return assertUnreachable(kind);
  } finally {
    walk.ancestors.delete(value);
  }
};

const sanitizeLeaf = (walk: Walk, value: unknown, path: string) => {
  const { stringLength } = walk.policy.limits;

  if (typeof value === "string" && value.length > stringLength) {
    return carry(walk, path, value.slice(0, stringLength), "truncated");
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    Number.isFinite(value)
  ) {
    return carry(walk, path, value, null);
  }

  if (typeof value === "bigint") {
    return carry(walk, path, String(value), "coerced");
  }

  return omit(walk, path, "invalid");
};

const sanitize = (
  walk: Walk,
  value: unknown,
  path: string,
  depth: number,
): unknown => {
  if (typeof value === "object" && value !== null) {
    return sanitizeContainer(walk, value, path, depth);
  }

  return sanitizeLeaf(walk, value, path);
};

const sanitizeRoot = (walk: Walk, value: unknown, root: string) => {
  if (value === undefined || value === null) {
    return Object.freeze({});
  }

  const sanitized = sanitize(walk, value, root, 0);

  if (isPlainObject(sanitized)) {
    return sanitized;
  }

  if (sanitized !== OMIT) {
    recordLoss(walk, root, "invalid");
  }

  return Object.freeze({});
};

export const sanitizeValue = (
  value: unknown,
  policy: PrivacyPolicy,
  root: string,
): Sanitized => {
  const walk: Walk = {
    policy,
    root,
    ancestors: new Set(),
    remaining: policy.limits.totalSize,
    losses: [],
  };

  const sanitized = sanitizeRoot(walk, value, root);

  Object.freeze(walk.losses);

  return { value: sanitized, losses: walk.losses };
};
