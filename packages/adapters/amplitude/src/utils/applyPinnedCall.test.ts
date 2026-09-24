import { TraceError } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { fakeAmplitude } from "src/fakeAmplitude.fixture";
import { identityPlugin } from "src/identityPlugin";
import { applyPinnedCall } from "src/utils/applyPinnedCall";

const setUp = async () => {
  const fake = fakeAmplitude();
  const plugin = identityPlugin();

  await fake.sdk.add(plugin).promise;

  return { fake, plugin };
};

const getThrown = (call: () => unknown) => {
  try {
    call();
  } catch (error) {
    return error;
  }

  return null;
};

test("the call names its user and the device Amplitude holds at the top level of its options and again in its extra, and answers what Amplitude answered", async () => {
  const { fake, plugin } = await setUp();
  const answer = { promise: Promise.resolve({ code: 200 }) };
  const made: unknown[] = [];

  expect(
    applyPinnedCall({ sdk: fake.sdk, plugin }, { id: "ada" }, (options) => {
      made.push(options);

      return answer;
    }),
  ).toBe(answer);
  expect(made).toStrictEqual([
    {
      user_id: "ada",
      device_id: "device-1",
      extra: {
        "@priemskiyyy/trace-amplitude": {
          user_id: "ada",
          device_id: "device-1",
        },
      },
    },
  ]);
});

test("once Amplitude has taken the plugin out, a call is refused with NOT_INITIALIZED and never made, since it would go out under whoever Amplitude holds", async () => {
  const { fake, plugin } = await setUp();
  const made: unknown[] = [];

  await fake.sdk.remove(plugin.name).promise;

  expect(
    getThrown(() =>
      applyPinnedCall({ sdk: fake.sdk, plugin }, null, (options) => {
        made.push(options);

        return { promise: Promise.resolve({ code: 200 }) };
      }),
    ),
  ).toStrictEqual(
    new TraceError({
      code: "NOT_INITIALIZED",
      message:
        "Trace's identity plugin is no longer installed in Amplitude, so the call was not sent. A later init() or remove() takes it out: add it again with add().",
    }),
  );
  expect(made).toStrictEqual([]);
});
