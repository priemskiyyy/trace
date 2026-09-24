import { expect, test } from "vitest";

import { getFlushTimeout } from "src/utils/internal/options/getFlushTimeout";

test("a timeout is kept within 0 and the longest timer, and NaN counts as 0", () => {
  expect(
    [500, 0, -1, 2 ** 31, Number.POSITIVE_INFINITY, Number.NaN].map((timeout) =>
      getFlushTimeout({ timeout }),
    ),
  ).toEqual([500, 0, 0, 2_147_483_647, 2_147_483_647, 0]);
});

test("no timeout, or options that cannot give one, waits the default 2 seconds", () => {
  const unreadable = {
    get timeout(): number {
      throw new Error("unreadable timeout");
    },
  };

  expect(
    [undefined, {}, unreadable].map((options) => getFlushTimeout(options)),
  ).toEqual([2_000, 2_000, 2_000]);
  // @ts-expect-error A JavaScript caller can pass options that are not an object.
  expect(getFlushTimeout(null)).toBe(2_000);
  // @ts-expect-error A JavaScript caller can pass a timeout that is not a number.
  expect(getFlushTimeout({ timeout: "fast" })).toBe(2_000);
});
