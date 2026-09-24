import { event, Trace } from "@priemskiyyy/trace";
import type { PostHog as PostHogBrowser } from "posthog-js";
import type { PostHog } from "posthog-node";
import type { PostHog as PostHogReactNative } from "posthog-react-native";
import { expectTypeOf } from "vitest";

import type { fakePostHog } from "src/fakePostHog.fixture";
import { posthog } from "src/posthog";
import type { PostHogLike } from "src/types/PostHogLike";

type ModelledMember =
  | "capture"
  | "identify"
  | "setPersonProperties"
  | "unsetPersonProperties"
  | "groupIdentify"
  | "flush"
  | "shutdown";

type FakeSdk = ReturnType<typeof fakePostHog>["sdk"];

type Capture = Parameters<PostHogLike["capture"]>[0];

declare const client: PostHog;
declare const browserClient: PostHogBrowser;
declare const reactNativeClient: PostHogReactNative;

export const sdk: PostHogLike = client;

expectTypeOf<FakeSdk>().toExtend<PostHogLike>();
expectTypeOf<FakeSdk>().toExtend<Pick<PostHog, ModelledMember>>();
expectTypeOf<keyof FakeSdk>().toExtend<keyof PostHog>();

// @ts-expect-error The adapter cannot capture without a distinct id, which posthog-node would take from withContext or make up.
expectTypeOf<Omit<Capture, "distinctId">>().toExtend<Capture>();

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: {
    research: posthog({ sdk: client, anonymousId: "visitor-7" }),
  },
});

expectTypeOf(
  trace.destination("research").native,
).toEqualTypeOf<PostHog | null>();

export const getFeatureFlag =
  trace.destination("research").native?.getFeatureFlag;

posthog({
  // @ts-expect-error An object that is not posthog-node is refused.
  sdk: { capture: () => {} },
});

posthog({
  // @ts-expect-error posthog-js holds a person between calls; it has its own package.
  sdk: browserClient,
});

posthog({
  // @ts-expect-error The React Native client holds a person between calls; it has its own package.
  sdk: reactNativeClient,
});

posthog({
  sdk: client,
  // @ts-expect-error The anonymous id is the visitor's id itself, not a function that finds it.
  anonymousId: () => "visitor-7",
});
