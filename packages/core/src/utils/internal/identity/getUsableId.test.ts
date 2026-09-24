import { expect, test } from "vitest";

import { getUsableId } from "src/utils/internal/identity/getUsableId";

test("a string with a character that is not white space is usable as it is", () => {
  expect(getUsableId("ada")).toBe("ada");
  expect(getUsableId(" w_1 ")).toBe(" w_1 ");
});

test("an empty or blank string, and anything that is not a string, is not usable", () => {
  expect(
    ["", "   ", "\n\t", 7, null, undefined, { id: "ada" }].map(getUsableId),
  ).toEqual([null, null, null, null, null, null, null]);
});
