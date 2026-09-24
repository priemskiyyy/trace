import { expect, test } from "vitest";

import { getLossReason } from "src/utils/getLossReason";

test.each([["pro"], [0], [49.5]])(
  "%j is kept as it is, because Heap takes text and numbers, numbers as numeric text",
  (value) => {
    expect(getLossReason("plan", value)).toBeNull();
  },
);

test.each([[true], [false], [["gift", 1, true]], [[]]])(
  "%j is coerced, because heap.js sends a boolean as text and joins an array with ||",
  (value) => {
    expect(getLossReason("plan", value)).toBe("coerced");
  },
);

test.each([
  [""],
  [null],
  [{ tier: "gold" }],
  [[{ tier: "gold" }]],
  [["a", null]],
  [[["a"]]],
])(
  "%j is unsupported, because Heap has no notion of a blank, null or nested value, and heap.js drops it",
  (value) => {
    expect(getLossReason("plan", value)).toBe("unsupported");
  },
);

test("text of 1024 characters or more is truncated, because Heap cuts it, and 1023 is kept", () => {
  expect(getLossReason("note", "n".repeat(1024))).toBe("truncated");
  expect(getLossReason("note", "n".repeat(1023))).toBeNull();
});

test("an array whose joined text reaches 1024 characters is truncated, because Heap cuts it as text", () => {
  expect(getLossReason("tags", ["a".repeat(1021), "b"])).toBe("truncated");
  expect(getLossReason("tags", ["a".repeat(1020), "b"])).toBe("coerced");
});

test("a name Heap refuses is invalid, whatever its value", () => {
  expect(getLossReason("k".repeat(512), "pro")).toBe("invalid");
  expect(getLossReason("é".repeat(257), 3)).toBe("invalid");
  expect(getLossReason("é".repeat(256), "pro")).toBeNull();
});
