import { expect, test } from "vitest";

import { formatConsent } from "src/formatting/formatConsent";

test("the header names each purpose with its decision, and nothing when no purpose is configured", () => {
  expect(
    formatConsent({
      analytics: "granted",
      advertising: "denied",
      marketing: "unknown",
    }),
  ).toBe("analytics granted · advertising denied · marketing unknown");
  expect(formatConsent({})).toBe("");
});
