import { expect, test } from "vitest";

import { resolveCount } from "src/utils/internal/options/resolveCount";

test("a count left undefined takes its default", () => {
  expect(resolveCount("buffer.capacity", undefined, 100)).toBe(100);
});

test("a whole number of 0 or more is kept as given", () => {
  expect(resolveCount("buffer.capacity", 0, 100)).toBe(0);
  expect(resolveCount("buffer.capacity", 7, 100)).toBe(7);
});

test.each([
  ["NaN", Number.NaN],
  ["a negative number", -1],
  ["a fraction", 1.5],
  ["infinity", Number.POSITIVE_INFINITY],
  ["a numeric string", "5"],
  ["null", null],
])("%s is refused with a TraceError that names the option", (_, value) => {
  expect(() => resolveCount("privacy.limits.depth", value, 6)).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message: "privacy.limits.depth must be a whole number of 0 or more.",
    }),
  );
});
