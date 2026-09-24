import { expect, test } from "vitest";

import { readField } from "src/utils/readField";

test("an own field is read, even one named after a prototype member", () => {
  expect(readField({ reason: "consent" }, "reason")).toBe("consent");
  expect(readField({ reason: null }, "reason")).toBeNull();
  expect(
    readField(Object.fromEntries([["__proto__", "own"]]), "__proto__"),
  ).toBe("own");
});

test("a missing or inherited field, or a value that is not an object, reads as undefined", () => {
  expect(readField({ reason: "consent" }, "status")).toBeUndefined();
  expect(readField({}, "toString")).toBeUndefined();
  expect(readField(null, "reason")).toBeUndefined();
  expect(readField(undefined, "reason")).toBeUndefined();
  expect(readField("consent", "length")).toBeUndefined();
});
