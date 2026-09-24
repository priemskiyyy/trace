import { expect, test } from "vitest";

import type { Layer } from "src/types/internal/Layer";
import type { MappingLoss } from "src/types/MappingLoss";
import { DEFAULT_LIMITS } from "src/utils/constants/limits";
import { boundLayer } from "src/utils/internal/intake/boundLayer";

const entry = (value: unknown, losses: MappingLoss[] = []) => ({
  value,
  losses,
});

test("what is held and what arrives stay within the breadth together: the newest keys are cut and never applied", () => {
  const layer: Layer = new Map([
    ["role", entry("admin")],
    ["team", entry("core")],
  ]);

  const bounded = boundLayer({
    held: { plan: "pro", seats: 3 },
    layer,
    root: "traits",
    limits: { ...DEFAULT_LIMITS, breadth: 3 },
  });

  expect([...bounded]).toEqual([
    ["role", entry("admin")],
    [
      "team",
      { value: undefined, losses: [{ path: "traits", reason: "truncated" }] },
    ],
  ]);
});

test("a replacement that does not fit beside what is held is left unapplied with its truncated loss, and nothing held is removed", () => {
  const bounded = boundLayer({
    held: { a: "x".repeat(20), b: "y".repeat(20) },
    layer: new Map([["a", entry("z".repeat(70))]]),
    root: "traits",
    limits: { ...DEFAULT_LIMITS, totalSize: 100 },
  });

  expect([...bounded]).toEqual([
    ["a", entry(undefined, [{ path: "traits.a", reason: "truncated" }])],
  ]);
});

test("a removal takes its key out before the rest is bounded", () => {
  const layer: Layer = new Map([
    ["a", entry(null)],
    ["c", entry("v".repeat(30))],
  ]);

  const bounded = boundLayer({
    held: { a: "x".repeat(40), b: "y".repeat(40) },
    layer,
    root: "traits",
    limits: { ...DEFAULT_LIMITS, totalSize: 100 },
  });

  expect([...bounded]).toEqual([
    ["a", entry(null)],
    ["c", entry("v".repeat(30))],
  ]);
});

test("a value the bound shortens is applied shortened, with the sanitizer's loss after its own", () => {
  const layer: Layer = new Map([
    [
      "list",
      {
        value: [1, 2, 3, 4, 5],
        losses: [{ path: "traits.list.0", reason: "coerced" }],
      },
    ],
  ]);

  const bounded = boundLayer({
    held: {},
    layer,
    root: "traits",
    limits: { ...DEFAULT_LIMITS, breadth: 3 },
  });

  expect([...bounded]).toEqual([
    [
      "list",
      {
        value: [1, 2, 3],
        losses: [
          { path: "traits.list.0", reason: "coerced" },
          { path: "traits.list", reason: "truncated" },
        ],
      },
    ],
  ]);
});

test("a key cut again keeps one truncated loss of the root", () => {
  const layer: Layer = new Map([
    [
      "c",
      {
        value: 3,
        losses: [
          { path: "traits.c.token", reason: "redacted" },
          { path: "traits", reason: "truncated" },
        ],
      },
    ],
  ]);

  const bounded = boundLayer({
    held: { a: 1, b: 2 },
    layer,
    root: "traits",
    limits: { ...DEFAULT_LIMITS, breadth: 2 },
  });

  expect([...bounded]).toEqual([
    [
      "c",
      {
        value: undefined,
        losses: [
          { path: "traits.c.token", reason: "redacted" },
          { path: "traits", reason: "truncated" },
        ],
      },
    ],
  ]);
});

test("entries with nothing to apply pass through, and neither the held values nor the layer change", () => {
  const held = Object.freeze({ plan: "pro" });

  const layer: Layer = new Map([
    ["token", entry(undefined, [{ path: "traits.token", reason: "redacted" }])],
    ["role", entry(undefined)],
  ]);

  const bounded = boundLayer({
    held,
    layer,
    root: "traits",
    limits: DEFAULT_LIMITS,
  });

  expect([...bounded]).toEqual([...layer]);
  expect(bounded).not.toBe(layer);
  expect(held).toEqual({ plan: "pro" });
});
