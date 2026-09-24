import { expect, test } from "vitest";

import type { Layer } from "src/types/internal/Layer";
import type { MappingLoss } from "src/types/MappingLoss";
import { composeContext } from "src/utils/internal/intake/composeContext";

const entry = (value: unknown, losses: MappingLoss[] = []) => ({
  value,
  losses,
});

const TRUNCATED: MappingLoss = { path: "context.note", reason: "truncated" };
const REDACTED: MappingLoss = { path: "context.token", reason: "redacted" };

test("a later layer wins per key, and each key keeps the losses of the layer that set it", () => {
  const composed = composeContext([
    new Map([
      ["app", entry("2.4.0")],
      ["note", entry("x".repeat(2_000), [TRUNCATED])],
      ["surface", entry("default")],
    ]),
    new Map([
      ["surface", entry("scope")],
      ["feature", entry("billing")],
    ]),
    new Map([
      ["note", entry("short")],
      ["surface", entry("call")],
    ]),
  ]);

  expect([...composed]).toEqual([
    ["app", entry("2.4.0")],
    ["note", entry("short")],
    ["surface", entry("call")],
    ["feature", entry("billing")],
  ]);
});

test("null removes a key from every layer below it, and a later layer may set it again", () => {
  const composed = composeContext([
    new Map([
      ["app", entry("2.4.0")],
      ["surface", entry("default")],
    ]),
    new Map([
      ["app", entry(null)],
      ["surface", entry(null)],
    ]),
    new Map([["surface", entry("call")]]),
  ]);

  expect([...composed]).toEqual([["surface", entry("call")]]);
});

test("a key removed at the door hides the value below it and keeps its losses", () => {
  const composed = composeContext([
    new Map([["token", entry("an old value")]]),
    new Map([["token", entry(undefined, [REDACTED])]]),
  ]);

  expect([...composed]).toEqual([["token", entry(undefined, [REDACTED])]]);
});

test("the layers it composes are never changed", () => {
  const base: Layer = new Map([["app", entry("2.4.0")]]);
  const incoming: Layer = new Map([["app", entry(null)]]);

  composeContext([base, incoming]);

  expect([...base]).toEqual([["app", entry("2.4.0")]]);
  expect([...incoming]).toEqual([["app", entry(null)]]);
});
