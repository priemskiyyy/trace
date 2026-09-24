import { expect, test } from "vitest";

import { isWholeNumber } from "src/utils/isWholeNumber";

test("a whole number a signed 64-bit integer holds is whole", () => {
  expect(
    [0, 7, -7, 2 ** 53, 2 ** 63 - 1024, -(2 ** 63)].map(isWholeNumber),
  ).toEqual([true, true, true, true, true, true]);
});

test("a fraction, a whole number past a signed 64-bit integer, and anything but a number are not whole", () => {
  expect(
    [2.5, 2 ** 63, -(2 ** 63) - 2048, "3", true, null, undefined].map(
      isWholeNumber,
    ),
  ).toEqual([false, false, false, false, false, false, false]);
});
