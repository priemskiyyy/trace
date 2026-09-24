import { expect, test } from "vitest";

import { formatEventId } from "src/formatting/formatEventId";

test("an event id is shortened for the row, and absent when the row has none", () => {
  expect(formatEventId({ id: "5f0c1c9e-6b1e-4a53-9d0e-2f6a1d0c7b11" })).toBe(
    "5f0c1c9e",
  );
  expect(formatEventId({ id: "short" })).toBe("short");
  expect(formatEventId(null)).toBe("");
});
