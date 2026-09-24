import { expect, test } from "vitest";

import { getSentSize } from "src/utils/getSentSize";

test("the size is the UTF-8 bytes of the JSON mixpanel-react-native sends", () => {
  expect(getSentSize({ city: "Zürich", visits: 3 })).toBe(29);
});

test("a string counts whole, since mixpanel-react-native cuts nothing", () => {
  expect(getSentSize(["x".repeat(300), "y"])).toBe(308);
});

test("a nested string counts whole too", () => {
  expect(getSentSize({ a: { b: ["é".repeat(256)] } })).toBe(528);
});
