import { expect, test } from "vitest";

import { fakeAmplitude } from "src/fakeAmplitude.fixture";
import { getPinnedOptions } from "src/utils/getPinnedOptions";

test("a call is pinned to its user and to the device Amplitude holds when the call is made", () => {
  const fake = fakeAmplitude();

  expect(getPinnedOptions(fake.sdk, { id: "ada" })).toStrictEqual({
    user_id: "ada",
    device_id: "device-1",
  });
  expect(fake.calls.getDeviceId).toBe(1);
});

test("an anonymous call names only the device", () => {
  expect(getPinnedOptions(fakeAmplitude().sdk, null)).toStrictEqual({
    device_id: "device-1",
  });
});

test("a call names no device when Amplitude answers none", () => {
  const fake = fakeAmplitude({ initialized: false });

  expect(getPinnedOptions(fake.sdk, { id: "ada" })).toStrictEqual({
    user_id: "ada",
  });
  expect(getPinnedOptions(fake.sdk, null)).toStrictEqual({});
});
