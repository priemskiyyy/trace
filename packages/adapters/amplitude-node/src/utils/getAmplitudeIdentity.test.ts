import { expect, test } from "vitest";

import { getAmplitudeIdentity } from "src/utils/getAmplitudeIdentity";

test("a user and a visitor id travel together, so Amplitude links the visitor's device to the user", () => {
  expect(getAmplitudeIdentity({ id: "user-ada" }, "visitor-7")).toStrictEqual({
    user_id: "user-ada",
    device_id: "visitor-7",
  });
});

test("a user without a visitor id travels alone, with no device id key", () => {
  expect(getAmplitudeIdentity({ id: "user-ada" }, undefined)).toStrictEqual({
    user_id: "user-ada",
  });
});

test("without a user the visitor id travels alone as the device, with no user id key", () => {
  expect(getAmplitudeIdentity(null, "visitor-7")).toStrictEqual({
    device_id: "visitor-7",
  });
});

test("with neither there is no identity, because Amplitude's API would reject the call", () => {
  expect(getAmplitudeIdentity(null, undefined)).toBe(null);
});

test("an id shorter than Amplitude's default minimum of 5 characters is named as it is, because init can lower the minimum", () => {
  expect(getAmplitudeIdentity({ id: "ada" }, "v-7")).toStrictEqual({
    user_id: "ada",
    device_id: "v-7",
  });
  expect(getAmplitudeIdentity(null, "v-7")).toStrictEqual({
    device_id: "v-7",
  });
});
