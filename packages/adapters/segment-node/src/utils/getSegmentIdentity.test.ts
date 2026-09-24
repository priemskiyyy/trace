import { expect, test } from "vitest";

import { getSegmentIdentity } from "src/utils/getSegmentIdentity";

test("a user and an anonymous id travel together, so Segment links the visitor to the user", () => {
  expect(getSegmentIdentity({ id: "ada" }, "visitor-7")).toStrictEqual({
    userId: "ada",
    anonymousId: "visitor-7",
  });
});

test("a user without an anonymous id travels alone, with no anonymous id key", () => {
  expect(getSegmentIdentity({ id: "ada" }, undefined)).toStrictEqual({
    userId: "ada",
  });
});

test("without a user the anonymous id travels alone, with no user id key", () => {
  expect(getSegmentIdentity(null, "visitor-7")).toStrictEqual({
    anonymousId: "visitor-7",
  });
});

test("with neither there is no identity, because analytics-node refuses a call without one", () => {
  expect(getSegmentIdentity(null, undefined)).toBe(null);
});
