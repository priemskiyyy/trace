import * as AmplitudeBrowser from "@amplitude/analytics-browser";
import * as AmplitudeNode from "@amplitude/analytics-node";
import * as AmplitudeReactNative from "@amplitude/analytics-react-native";
import { event, Trace } from "@priemskiyyy/trace";
import { expectTypeOf } from "vitest";

import { amplitude } from "src/amplitude";
import type { fakeAmplitude } from "src/fakeAmplitude.fixture";
import { identityPlugin } from "src/identityPlugin";
import type { AmplitudeEventOptions } from "src/types/AmplitudeEventOptions";
import type { AmplitudeIdentifyLike } from "src/types/AmplitudeIdentifyLike";
import type { AmplitudeLike } from "src/types/AmplitudeLike";
import type { IdentityPlugin } from "src/types/IdentityPlugin";

type ModelledMember =
  | "init"
  | "remove"
  | "track"
  | "getDeviceId"
  | "setUserId"
  | "identify"
  | "setGroup"
  | "groupIdentify"
  | "reset"
  | "setOptOut"
  | "flush";

type FakeSdk = ReturnType<typeof fakeAmplitude>["sdk"];

const plugin = identityPlugin();

export const browserSdk: AmplitudeLike = AmplitudeBrowser;
export const browserInstance: AmplitudeLike = AmplitudeBrowser.createInstance();
export const reactNativeSdk: AmplitudeLike = AmplitudeReactNative;
export const reactNativeInstance: AmplitudeLike =
  AmplitudeReactNative.createInstance();
export const identify: AmplitudeIdentifyLike = new AmplitudeBrowser.Identify();
export const browserPlugin = AmplitudeBrowser.add(plugin);
export const browserInstancePlugin =
  AmplitudeBrowser.createInstance().add(plugin);
export const reactNativePlugin = AmplitudeReactNative.add(plugin);

expectTypeOf<IdentityPlugin>().toExtend<AmplitudeBrowser.Types.EnrichmentPlugin>();
expectTypeOf<IdentityPlugin>().toExtend<
  Parameters<typeof AmplitudeBrowser.add>[0]
>();
expectTypeOf<IdentityPlugin>().toExtend<
  Parameters<typeof AmplitudeReactNative.add>[0]
>();
expectTypeOf<Parameters<FakeSdk["add"]>[0]>().toEqualTypeOf<IdentityPlugin>();
expectTypeOf<ReturnType<FakeSdk["add"]>>().toExtend<
  ReturnType<typeof AmplitudeBrowser.add>
>();
expectTypeOf<FakeSdk>().toExtend<AmplitudeLike>();
expectTypeOf<FakeSdk>().toExtend<
  Pick<typeof AmplitudeBrowser, ModelledMember>
>();
expectTypeOf<FakeSdk>().toExtend<
  Pick<typeof AmplitudeReactNative, ModelledMember>
>();
expectTypeOf<AmplitudeEventOptions>().toExtend<AmplitudeBrowser.Types.EventOptions>();
expectTypeOf<
  Awaited<ReturnType<typeof AmplitudeBrowser.track>["promise"]>
>().toExtend<{ code: number }>();

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: {
    web: amplitude({
      sdk: AmplitudeBrowser,
      Identify: AmplitudeBrowser.Identify,
      plugin,
    }),
    mobile: amplitude({
      sdk: AmplitudeReactNative,
      Identify: AmplitudeReactNative.Identify,
      plugin,
    }),
  },
});

expectTypeOf(trace.destination("web").native).toEqualTypeOf<
  typeof AmplitudeBrowser | null
>();
expectTypeOf(trace.destination("mobile").native).toEqualTypeOf<
  typeof AmplitudeReactNative | null
>();

export const sessionId = trace.destination("web").native?.getSessionId;
export const trackScreenView =
  trace.destination("mobile").native?.trackScreenView;

amplitude({
  // @ts-expect-error An object that is not an Amplitude SDK is refused.
  sdk: { track: () => ({ promise: Promise.resolve({ code: 200 }) }) },
  Identify: AmplitudeBrowser.Identify,
  plugin,
});

amplitude({
  // @ts-expect-error The Node SDK holds no user between calls; it has its own package.
  sdk: AmplitudeNode,
  Identify: AmplitudeNode.Identify,
  plugin,
});

amplitude({
  sdk: AmplitudeBrowser,
  // @ts-expect-error Identify is the class the adapter constructs, not an instance.
  Identify: new AmplitudeBrowser.Identify(),
  plugin,
});

// @ts-expect-error Identify is required: every trait and group trait travels through it.
amplitude({ sdk: AmplitudeBrowser, plugin });

// @ts-expect-error The plugin is required: without it an anonymous event can be filed under the next user.
amplitude({ sdk: AmplitudeBrowser, Identify: AmplitudeBrowser.Identify });

amplitude({
  sdk: AmplitudeBrowser,
  Identify: AmplitudeBrowser.Identify,
  // @ts-expect-error The plugin comes from identityPlugin(), not from any Amplitude plugin.
  plugin: { name: "other", type: "enrichment" },
});
