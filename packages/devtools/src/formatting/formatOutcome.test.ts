import { expect, test } from "vitest";

import { formatOutcome } from "src/formatting/formatOutcome";

test("an outcome names its destination and status, then what its diagnostic adds", () => {
  expect(
    formatOutcome({
      destination: "product",
      status: "submitted",
      summary: "sdk-call-returned · 1 loss",
    }),
  ).toBe("product · submitted · sdk-call-returned · 1 loss");
  expect(
    formatOutcome({ destination: "backend", status: "pending", summary: "" }),
  ).toBe("backend · pending");
});
