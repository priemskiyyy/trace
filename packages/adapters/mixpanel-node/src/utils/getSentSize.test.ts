import { expect, test } from "vitest";

import { getSentSize } from "src/utils/getSentSize";

test("the size is the UTF-8 bytes of the JSON the client sends", () => {
  expect(getSentSize({ city: "Zürich", visits: 3 })).toBe(29);
});

test("a string counts whole, because the mixpanel Node client cuts nothing", () => {
  expect(getSentSize(["x".repeat(300), "y"])).toBe(308);
});

test("a nested string counts whole too, in UTF-8 bytes", () => {
  expect(getSentSize({ a: { b: ["é".repeat(256)] } })).toBe(528);
});
