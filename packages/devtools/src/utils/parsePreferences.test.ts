import { expect, test } from "vitest";

import { parsePreferences } from "src/utils/parsePreferences";

test("keeps the fields a stored value spells correctly and forgets the rest", () => {
  expect(
    parsePreferences({
      isOpen: true,
      position: "right",
      height: 300,
      width: 500,
      showValues: true,
      extra: 1,
    }),
  ).toEqual({
    isOpen: true,
    position: "right",
    height: 300,
    width: 500,
    showValues: true,
  });
  expect(
    parsePreferences({
      isOpen: false,
      position: "bottom",
      showValues: false,
    }),
  ).toEqual({ isOpen: false, position: "bottom", showValues: false });
  expect(
    parsePreferences({
      isOpen: "yes",
      position: "top",
      height: -1,
      width: 1.5,
      showValues: 1,
    }),
  ).toEqual({});
  expect(parsePreferences({ height: 0, width: "500" })).toEqual({});
  expect(parsePreferences(null)).toEqual({});
  expect(parsePreferences("[]")).toEqual({});
});
