import { Identify } from "@amplitude/analytics-browser";
import { TraceError } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { fakeAmplitude } from "src/fakeAmplitude.fixture";
import { identityPlugin } from "src/identityPlugin";
import { applyGroup } from "src/utils/applyGroup";

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

test("a membership is setGroup and its traits one groupIdentify, each naming the user and device at the top level and in its extra, which the plugin files it under", async () => {
  const { fake, options } = setUp();

  applyGroup(options, {
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: { plan: "team" } },
  });

  expect(fake.calls.setGroup).toStrictEqual([
    {
      groupType: "workspace",
      groupName: "w_1",
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
  expect(fake.calls.groupIdentify).toStrictEqual([
    {
      groupType: "workspace",
      groupName: "w_1",
      groupProperties: { $set: { plan: "team" } },
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
  await fake.process();

  expect(
    fake.uploaded.map(({ event_type, user_id, device_id }) => ({
      event_type,
      user_id,
      device_id,
    })),
  ).toStrictEqual([
    { event_type: "$identify", user_id: "ada", device_id: "device-1" },
    { event_type: "$groupidentify", user_id: "ada", device_id: "device-1" },
  ]);
});

test("a membership without traits sends no groupIdentify", () => {
  const { fake, options } = setUp();

  applyGroup(options, {
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: {} },
  });

  expect(fake.calls.setGroup).toStrictEqual([
    {
      groupType: "workspace",
      groupName: "w_1",
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
  expect(fake.calls.groupIdentify).toStrictEqual([]);
});

test("leaving a group overwrites its type with an empty list, Amplitude having no call that leaves one", () => {
  const { fake, options } = setUp();

  applyGroup(options, {
    user: { id: "ada" },
    group: { type: "workspace", id: null, traits: {} },
  });

  expect(fake.calls.setGroup).toStrictEqual([
    {
      groupType: "workspace",
      groupName: [],
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
  expect(fake.calls.groupIdentify).toStrictEqual([]);
});

test("a group trait set to null is removed from the group with an unset", () => {
  const { fake, options } = setUp();

  applyGroup(options, {
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: { tier: null, seats: 3 } },
  });

  expect(fake.calls.groupIdentify).toStrictEqual([
    {
      groupType: "workspace",
      groupName: "w_1",
      groupProperties: { $unset: { tier: "-" }, $set: { seats: 3 } },
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
});

test("a group trait Amplitude cannot take is left out whole, a list holding a null included, the rest is sent, and then the update is reported unsupported", () => {
  const { fake, options } = setUp();

  const thrown = getThrown(() =>
    applyGroup(options, {
      user: { id: "ada" },
      group: {
        type: "workspace",
        id: "w_1",
        traits: { tags: [null, "beta"], plan: "team" },
      },
    }),
  );

  expect(fake.calls.groupIdentify).toStrictEqual([
    {
      groupType: "workspace",
      groupName: "w_1",
      groupProperties: { $set: { plan: "team" } },
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
  expect(thrown).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Amplitude cannot take these values, so they were left out: group.workspace.tags.",
    }),
  );
});
