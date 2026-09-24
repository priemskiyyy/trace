import { expect, test } from "vitest";

import { resolveDuration } from "src/utils/internal/options/resolveDuration";

test("a duration left undefined takes its default", () => {
  expect(resolveDuration("timeout", undefined, 5_000)).toBe(5_000);
});

test("a whole number of milliseconds up to the longest timer is kept as given", () => {
  expect(resolveDuration("timeout", 0, 5_000)).toBe(0);
  expect(resolveDuration("timeout", 2_147_483_647, 5_000)).toBe(2_147_483_647);
});

test.each([
  ["NaN", Number.NaN],
  ["a negative number", -1],
  ["a fraction", 0.5],
  ["infinity", Number.POSITIVE_INFINITY],
  ["a duration a timer would fire at once for", 2_147_483_648],
  ["a numeric string", "100"],
])("%s is refused with a TraceError that names the option", (_, value) => {
  expect(() => resolveDuration("buffer.maxAge", value, 30_000)).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message:
        "buffer.maxAge must be a whole number of milliseconds from 0 to 2147483647.",
    }),
  );
});
