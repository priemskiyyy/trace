import { expect, test } from "vitest";

import { isPropertyName } from "src/utils/isPropertyName";

test("a name of fewer than 512 characters that takes at most 512 bytes is taken", () => {
  expect(isPropertyName("k".repeat(511))).toBe(true);
  expect(isPropertyName("é".repeat(256))).toBe(true);
});

test("a name of 512 characters is refused, because Heap documents fewer", () => {
  expect(isPropertyName("k".repeat(512))).toBe(false);
});

test("a name over 512 bytes is refused, because heap.js drops its property", () => {
  expect(isPropertyName("é".repeat(257))).toBe(false);
  expect(isPropertyName("😀".repeat(129))).toBe(false);
});
