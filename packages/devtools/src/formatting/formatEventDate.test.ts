import { expect, test } from "vitest";

import { formatEventDate } from "src/formatting/formatEventDate";

test("an event date is the full ISO timestamp", () => {
  expect(formatEventDate(Date.UTC(2026, 8, 20, 9, 5, 7, 42))).toBe(
    "2026-09-20T09:05:07.042Z",
  );
});

test("a time outside the calendar is shown as nothing rather than breaking the row", () => {
  expect(formatEventDate(8.64e15 + 1)).toBe("");
});
