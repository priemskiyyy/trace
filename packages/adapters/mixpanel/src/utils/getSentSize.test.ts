import { expect, test } from "vitest";

import { getSentSize } from "src/utils/getSentSize";

test("the size is the UTF-8 bytes of the JSON mixpanel-browser sends", () => {
  expect(getSentSize({ city: "Zürich", visits: 3 })).toBe(29);
});

test("a string counts only the 255 code units mixpanel-browser keeps of it", () => {
  expect(getSentSize(["x".repeat(300), "y"])).toBe(263);
});

test("a nested string is counted as cut too", () => {
  expect(getSentSize({ a: { b: ["é".repeat(256)] } })).toBe(526);
});
