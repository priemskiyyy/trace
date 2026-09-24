import { expect, test } from "vitest";

import { identityPlugin } from "src/identityPlugin";
import { getPinnedOptions } from "src/utils/getPinnedOptions";

const createPlugin = async () => {
  const plugin = identityPlugin();

  await plugin.setup();

  return plugin;
};

test("a user's call carries that user and the device Amplitude holds now, in its options, where Amplitude keeps them, and in its extra for the plugin", async () => {
  expect(
    getPinnedOptions(
      await createPlugin(),
      { getDeviceId: () => "device-1" },
      { id: "user_42" },
    ),
  ).toStrictEqual({
    user_id: "user_42",
    device_id: "device-1",
    extra: {
      "@priemskiyyy/trace-ampli": { user_id: "user_42", device_id: "device-1" },
    },
  });
});

test("an anonymous call carries only the device, so Amplitude fills in its user and the plugin takes it out", async () => {
  expect(
    getPinnedOptions(
      await createPlugin(),
      { getDeviceId: () => "device-1" },
      null,
    ),
  ).toStrictEqual({
    device_id: "device-1",
    extra: { "@priemskiyyy/trace-ampli": { device_id: "device-1" } },
  });
});

test("a device Amplitude does not know yet is left for Amplitude to fill", async () => {
  expect(
    getPinnedOptions(
      await createPlugin(),
      { getDeviceId: () => undefined },
      { id: "user_42" },
    ),
  ).toStrictEqual({
    user_id: "user_42",
    extra: { "@priemskiyyy/trace-ampli": { user_id: "user_42" } },
  });
});

test("once Amplitude has taken the plugin out, a call is refused with NOT_INITIALIZED, since nothing would pin it and it would go out under whoever Amplitude holds", async () => {
  const plugin = await createPlugin();

  await plugin.teardown();

  expect(() =>
    getPinnedOptions(
      plugin,
      { getDeviceId: () => "device-1" },
      { id: "user_42" },
    ),
  ).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "NOT_INITIALIZED",
      message:
        "Trace's identity plugin is no longer installed on ampli.client, so the call was not sent. A later init() or remove() takes it out: add it again with ampli.client.add().",
    }),
  );
});
