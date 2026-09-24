import { expect, test } from "vitest";

import { unrefTimer } from "src/utils/internal/destinations/unrefTimer";

test("a Node timer is unreferenced, so the process can still exit", () => {
  const timer = setTimeout(() => {}, 1_000);

  unrefTimer(timer);
  clearTimeout(timer);

  expect(timer.hasRef()).toBe(false);
});

test("a numeric browser or React Native timer id is left alone", () => {
  // @ts-expect-error A browser or React Native timer id is a number, which Node's types do not allow.
  expect(() => unrefTimer(7)).not.toThrow();
});
