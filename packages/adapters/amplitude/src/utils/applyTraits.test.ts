import { Identify } from "@amplitude/analytics-browser";
import { TraceError } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { fakeAmplitude } from "src/fakeAmplitude.fixture";
import { identityPlugin } from "src/identityPlugin";
import { applyTraits } from "src/utils/applyTraits";

const setUp = () => {
  const fake = fakeAmplitude();
  const plugin = identityPlugin();

  fake.sdk.add(plugin);

  return { fake, options: { sdk: fake.sdk, Identify, plugin } };
};

const getThrown = (call: () => unknown) => {
  try {
    call();
  } catch (error) {
    return error;
  }

  return null;
};

test("traits are one identify call naming their user and the device Amplitude held, at the top level and in its extra, which the plugin files it under", async () => {
  const { fake, options } = setUp();

  applyTraits(options, {
    user: { id: "ada" },
    set: { plan: "pro" },
    remove: ["legacy"],
  });

  expect(fake.calls.identify).toStrictEqual([
    {
      userProperties: { $unset: { legacy: "-" }, $set: { plan: "pro" } },
      eventOptions: {
        user_id: "ada",
        device_id: "device-1",
        extra: {
          "@priemskiyyy/trace-amplitude": {
            user_id: "ada",
            device_id: "device-1",
          },
        },
      },
    },
  ]);

  fake.sdk.reset();
  fake.sdk.setUserId("bob");
  await fake.process();

  expect(
    fake.uploaded.map(({ event_type, user_id, device_id }) => ({
      event_type,
      user_id,
      device_id,
    })),
  ).toStrictEqual([
    { event_type: "$identify", user_id: "ada", device_id: "device-1" },
  ]);
});

test("anonymous traits reach Amplitude with no user, whoever it holds when it processes them", async () => {
  const { fake, options } = setUp();

  applyTraits(options, { user: null, set: { plan: "pro" }, remove: [] });
  fake.sdk.setUserId("bob");
  await fake.process();

  expect(
    fake.uploaded.map(({ user_id, device_id }) => ({ user_id, device_id })),
  ).toStrictEqual([{ user_id: undefined, device_id: "device-1" }]);
});

test("a value Amplitude cannot take is left out whole, a list holding a null included, the rest is sent, and then the update is reported unsupported", () => {
  const { fake, options } = setUp();

  const thrown = getThrown(() =>
    applyTraits(options, {
      user: null,
      set: { plan: "pro", tags: [null, "beta"], note: "a".repeat(1_025) },
      remove: [],
    }),
  );

  expect(fake.calls.identify).toStrictEqual([
    {
      userProperties: { $set: { plan: "pro" } },
      eventOptions: {
        device_id: "device-1",
        extra: { "@priemskiyyy/trace-amplitude": { device_id: "device-1" } },
      },
    },
  ]);
  expect(thrown).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Amplitude cannot take these values, so they were left out: traits.tags, traits.note.",
    }),
  );
});
