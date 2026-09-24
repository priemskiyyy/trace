import { expect, test, vi } from "vitest";

import type { Layer } from "src/types/internal/Layer";
import type { PrivacyPolicy } from "src/types/internal/PrivacyPolicy";
import { DEFAULT_LIMITS } from "src/utils/constants/limits";
import { prepareEvent } from "src/utils/internal/intake/prepareEvent";
import { isSensitiveKey } from "src/utils/isSensitiveKey";

const POLICY: PrivacyPolicy = {
  redact: isSensitiveKey,
  limits: DEFAULT_LIMITS,
};

const prepare = (overrides: Partial<Parameters<typeof prepareEvent>[0]> = {}) =>
  prepareEvent({
    properties: { query: "shoes" },
    layers: [],
    context: undefined,
    policy: POLICY,
    ...overrides,
  });

test("properties and context are sanitized, and the losses list properties, then each context key, then what bounded the context", () => {
  const defaults: Layer = new Map([
    [
      "build",
      {
        value: "b".repeat(2_000),
        losses: [{ path: "context.build", reason: "truncated" }],
      },
    ],
    ["screen", { value: "home", losses: [] }],
  ]);

  const prepared = prepare({
    properties: { query: "shoes", card: { token: "tok_1" }, at: new Date(0) },
    layers: [{ layer: defaults, refused: [] }],
    context: { password: "hunter2", screen: "cart" },
  });

  expect(prepared).toEqual({
    kind: "PREPARED",
    properties: {
      query: "shoes",
      card: {},
      at: "1970-01-01T00:00:00.000Z",
    },
    context: { build: "b".repeat(2_000), screen: "cart" },
    losses: [
      { path: "properties.card.token", reason: "redacted" },
      { path: "properties.at", reason: "coerced" },
      { path: "context.build", reason: "truncated" },
      { path: "context.password", reason: "redacted" },
    ],
  });
});

test("everything prepared is frozen all the way down", () => {
  const prepared = prepare({
    properties: { query: "shoes", filters: { size: [42] } },
    context: { screen: { name: "search" } },
  });

  expect(prepared.kind).toBe("PREPARED");

  if (prepared.kind !== "PREPARED") {
    return;
  }

  expect(Object.isFrozen(prepared.properties)).toBe(true);
  expect(Object.isFrozen(prepared.properties.filters)).toBe(true);
  expect(Object.isFrozen(prepared.context)).toBe(true);
  expect(Object.isFrozen(prepared.context.screen)).toBe(true);
  expect(Object.isFrozen(prepared.losses)).toBe(true);
});

test("null in the call's context removes a key the layers below it set", () => {
  const defaults: Layer = new Map([
    ["screen", { value: "home", losses: [] }],
    ["app", { value: "2.4.0", losses: [] }],
  ]);

  expect(
    prepare({
      layers: [{ layer: defaults, refused: [] }],
      context: { screen: null },
    }),
  ).toMatchObject({ kind: "PREPARED", context: { app: "2.4.0" } });
});

test("the composed context is bounded as a whole", () => {
  const defaults: Layer = new Map([
    ["app", { value: "2.4.0", losses: [] }],
    ["build", { value: 7, losses: [] }],
  ]);

  const prepared = prepare({
    layers: [{ layer: defaults, refused: [] }],
    context: { screen: "cart" },
    policy: {
      redact: isSensitiveKey,
      limits: { ...DEFAULT_LIMITS, breadth: 2 },
    },
  });

  expect(prepared).toEqual({
    kind: "PREPARED",
    properties: { query: "shoes" },
    context: { app: "2.4.0", build: 7 },
    losses: [{ path: "context", reason: "truncated" }],
  });
});

test("a call context or a layer that is not an object is one invalid loss of the context, and the event is still prepared", () => {
  expect(prepare({ context: "home" })).toEqual({
    kind: "PREPARED",
    properties: { query: "shoes" },
    context: {},
    losses: [{ path: "context", reason: "invalid" }],
  });
  expect(
    prepare({
      layers: [{ layer: new Map(), refused: ["context"] }],
      context: ["home"],
    }),
  ).toEqual({
    kind: "PREPARED",
    properties: { query: "shoes" },
    context: {},
    losses: [{ path: "context", reason: "invalid" }],
  });
});

test("the context losses of every layer stay within the breadth, and one truncated loss of the context stands for the rest", () => {
  const defaults: Layer = new Map([
    [
      "app",
      {
        value: {},
        losses: [
          { path: "context.app.token", reason: "redacted" },
          { path: "context.app.secret", reason: "redacted" },
        ],
      },
    ],
  ]);

  const prepared = prepare({
    layers: [{ layer: defaults, refused: [] }],
    context: { cookie: "c_1" },
    policy: {
      redact: isSensitiveKey,
      limits: { ...DEFAULT_LIMITS, breadth: 2 },
    },
  });

  expect(prepared).toEqual({
    kind: "PREPARED",
    properties: { query: "shoes" },
    context: { app: {} },
    losses: [
      { path: "context.app.token", reason: "redacted" },
      { path: "context.app.secret", reason: "redacted" },
      { path: "context", reason: "truncated" },
    ],
  });
});

test("the layers below the call were redacted at their own door, so they are bounded but never asked about again", () => {
  const redact = vi.fn(isSensitiveKey);

  const defaults: Layer = new Map([
    ["app", { value: { version: "2.4.0" }, losses: [] }],
  ]);

  prepare({
    properties: {},
    layers: [{ layer: defaults, refused: [] }],
    context: { screen: "home" },
    policy: { redact, limits: DEFAULT_LIMITS },
  });

  expect(redact.mock.calls).toEqual([["screen", "context.screen"]]);
});

test("a redact that throws fails the event instead of throwing", () => {
  const policy: PrivacyPolicy = {
    redact: () => {
      throw new Error("redact exploded");
    },
    limits: DEFAULT_LIMITS,
  };

  expect(prepare({ policy })).toEqual({ kind: "FAILED" });
});
