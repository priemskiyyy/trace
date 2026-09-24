import { TraceError } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { fakeMixpanel } from "src/fakeMixpanel.fixture";
import { applyIdentify } from "src/utils/applyIdentify";

const getThrown = (task: () => unknown) => {
  try {
    task();
  } catch (error) {
    return error;
  }

  return null;
};

test("the user's id becomes Mixpanel's distinct id", () => {
  const fake = fakeMixpanel();

  applyIdentify(fake.sdk, "ada");

  expect(fake.calls).toEqual([{ method: "identify", args: ["ada"] }]);
  expect(fake.state.persisted).toEqual({
    distinct_id: "ada",
    $user_id: "ada",
    $device_id: "device-1",
  });
});

test("an id Mixpanel refuses, one starting with $device:, throws TraceError UNSUPPORTED", () => {
  const fake = fakeMixpanel();

  const refusal = getThrown(() => applyIdentify(fake.sdk, "$device:ada"));

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({
    code: "UNSUPPORTED",
    message:
      "Mixpanel refused to identify the user: an id may not start with $device:, and a before_identify hook refuses one by answering undefined.",
  });
  expect(fake.state.persisted).toEqual({
    distinct_id: "$device:device-1",
    $device_id: "device-1",
  });
});

test("an id over 255 characters, which mixpanel-browser would cut, throws TraceError DELIVERY_FAILED before Mixpanel sees it, and one of 255 is identified", () => {
  const fake = fakeMixpanel();

  const failure = getThrown(() => applyIdentify(fake.sdk, "u".repeat(256)));

  expect(failure).toBeInstanceOf(TraceError);
  expect(failure).toMatchObject({
    code: "DELIVERY_FAILED",
    message:
      "mixpanel-browser keeps the first 255 characters of a distinct id, so this user would share an identity with any id that starts the same.",
  });
  expect(fake.calls).toEqual([]);

  applyIdentify(fake.sdk, "u".repeat(255));

  expect(fake.calls).toEqual([{ method: "identify", args: ["u".repeat(255)] }]);
});
