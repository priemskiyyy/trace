import { expect, test } from "vitest";

import { getDistinctId } from "src/utils/getDistinctId";

test("a signed-in call goes under its user, whatever the visitor id", () => {
  expect(getDistinctId({ id: "ada" }, "visitor-7")).toBe("ada");
  expect(getDistinctId({ id: "ada" }, undefined)).toBe("ada");
  expect(getDistinctId({ id: "ada" }, "")).toBe("ada");
});

test("a signed-out call goes under the visitor id, and without one it has none", () => {
  expect(getDistinctId(null, "visitor-7")).toBe("visitor-7");
  expect(getDistinctId(null, undefined)).toBe(null);
});

test("a visitor id of 200 characters is kept, and one of 201, which PostHog would shorten, is not", () => {
  expect(getDistinctId(null, "v".repeat(200))).toBe("v".repeat(200));
  expect(getDistinctId(null, "v".repeat(201))).toBe(null);
});

test.each(["", " ", "\t\n"])(
  "a blank visitor id %j, which posthog-node takes for none or PostHog discards, is not kept",
  (anonymousId) => {
    expect(getDistinctId(null, anonymousId)).toBe(null);
  },
);
