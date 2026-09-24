import * as AmplitudeBrowser from "@amplitude/analytics-browser";
import * as Amplitude from "@amplitude/analytics-node";
import { createInstance, Identify } from "@amplitude/analytics-node";
import type { Types } from "@amplitude/analytics-node";
import * as AmplitudeReactNative from "@amplitude/analytics-react-native";
import { event, Trace } from "@priemskiyyy/trace";
import { expectTypeOf } from "vitest";

import { amplitude } from "src/amplitude";
import type { fakeAmplitude } from "src/fakeAmplitude.fixture";
import type { AmplitudeEventOptions } from "src/types/AmplitudeEventOptions";
import type { AmplitudeIdentifyLike } from "src/types/AmplitudeIdentifyLike";
import type { AmplitudeLike } from "src/types/AmplitudeLike";

type ModelledMember =
  "init" | "track" | "identify" | "setGroup" | "groupIdentify" | "flush";

type FakeSdk = ReturnType<typeof fakeAmplitude>["sdk"];

export const sdk: AmplitudeLike = Amplitude;
export const instance: AmplitudeLike = createInstance();
export const identify: AmplitudeIdentifyLike = new Identify();

expectTypeOf<FakeSdk>().toExtend<AmplitudeLike>();
expectTypeOf<FakeSdk>().toExtend<Pick<Types.NodeClient, ModelledMember>>();
expectTypeOf<keyof FakeSdk>().toExtend<keyof Types.NodeClient>();
expectTypeOf<AmplitudeEventOptions>().toExtend<Types.EventOptions>();
expectTypeOf<
  Awaited<ReturnType<typeof Amplitude.track>["promise"]>
>().toExtend<{ code: number }>();

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: {
    product: amplitude({ sdk: Amplitude, Identify, anonymousId: "visitor-7" }),
  },
});

expectTypeOf(trace.destination("product").native).toEqualTypeOf<
  typeof Amplitude | null
>();

export const revenue = trace.destination("product").native?.revenue;

amplitude({
  // @ts-expect-error An object that is not an Amplitude SDK is refused.
  sdk: { track: () => ({ promise: Promise.resolve({ code: 200 }) }) },
  Identify,
});

amplitude({
  // @ts-expect-error The browser SDK keeps a user and fills it into calls that name none; it has its own package.
  sdk: AmplitudeBrowser,
  Identify,
});

amplitude({
  // @ts-expect-error The React Native SDK keeps a user the same way; it has its own package.
  sdk: AmplitudeReactNative,
  Identify,
});

amplitude({
  sdk: Amplitude,
  // @ts-expect-error Identify is the class the adapter constructs, not an instance.
  Identify: new Identify(),
});

// @ts-expect-error Identify is required: every trait and group trait travels through it.
amplitude({ sdk: Amplitude });

amplitude({
  sdk: Amplitude,
  Identify,
  // @ts-expect-error The anonymous id is the visitor's id itself, not a function that finds it.
  anonymousId: () => "visitor-7",
});
