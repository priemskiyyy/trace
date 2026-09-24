import type { MappingLoss } from "@priemskiyyy/trace";

import {
  MAX_LIST_ITEMS,
  MAX_NAME_LENGTH,
  MAX_NESTING_DEPTH,
  MAX_OBJECT_KEYS,
  MAX_STRING_LENGTH,
} from "src/utils/constants/limits";

export const getMixpanelValue = (
  value: unknown,
  path: string,
  depth: number,
  inList: boolean,
): { value: unknown; losses: MappingLoss[] } => {
  if (typeof value === "string") {
    const isCut = value.length > MAX_STRING_LENGTH;

    return { value, losses: isCut ? [{ path, reason: "truncated" }] : [] };
  }

  const losses: MappingLoss[] = [];

  if (Array.isArray(value)) {
    const items = value.flatMap((item: unknown, index) => {
      const itemPath = `${path}.${index}`;

      if (index >= MAX_LIST_ITEMS) {
        losses.push({ path: itemPath, reason: "truncated" });

        return [];
      }

      const carried = getMixpanelValue(item, itemPath, depth, true);

      losses.push(...carried.losses);

      return carried.value === undefined ? [] : [carried.value];
    });

    return { value: items, losses };
  }

  if (typeof value !== "object" || value === null) {
    return { value, losses };
  }

  if (depth > MAX_NESTING_DEPTH) {
    return { value: undefined, losses: [{ path, reason: "unsupported" }] };
  }

  const entries = Object.entries(value).flatMap(
    ([key, child]: [string, unknown], index): [string, unknown][] => {
      const childPath = `${path}.${key}`;

      if (index >= MAX_OBJECT_KEYS) {
        losses.push({ path: childPath, reason: "truncated" });

        return [];
      }

      if (inList && typeof child === "object" && child !== null) {
        losses.push({ path: childPath, reason: "unsupported" });

        return [];
      }

      const carried = getMixpanelValue(child, childPath, depth + 1, false);

      if (carried.value === undefined) {
        losses.push(...carried.losses);

        return [];
      }

      const isNameCut =
        key.length > MAX_NAME_LENGTH &&
        carried.losses.every((loss) => loss.path !== childPath);

      if (isNameCut) {
        losses.push({ path: childPath, reason: "truncated" });
      }

      losses.push(...carried.losses);

      return [[key, carried.value]];
    },
  );

  return { value: Object.fromEntries(entries), losses };
};
