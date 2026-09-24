import { event, Trace } from "@priemskiyyy/trace";
import posthogJs, { PostHog } from "posthog-js";
import type { PostHogConfig } from "posthog-js";
import type { PostHog as PostHogNode } from "posthog-node";
import type { PostHog as PostHogReactNative } from "posthog-react-native";
import { expectTypeOf } from "vitest";

import type { fakePostHog } from "src/fakePostHog.fixture";
import { posthog } from "src/posthog";
import type { PostHogLike } from "src/types/PostHogLike";

type ModelledMember =
  | "__loaded"
  | "capture"
  | "identify"
  | "setPersonProperties"
  | "unsetPersonProperties"
  | "group"
  | "getGroups"
  | "register"
  | "reset"
  | "opt_in_capturing"
  | "opt_out_capturing";

type FakeSdk = ReturnType<typeof fakePostHog>["sdk"];

declare const reactNativeClient: PostHogReactNative;
declare const nodeClient: PostHogNode;

export const sdk: PostHogLike = posthogJs;
export const instance: PostHogLike = new PostHog();

expectTypeOf<FakeSdk>().toExtend<PostHogLike>();
expectTypeOf<FakeSdk>().toExtend<Pick<PostHog, ModelledMember>>();
expectTypeOf<FakeSdk["config"]>().toExtend<
  Pick<PostHogConfig, "properties_string_max_length">
>();
expectTypeOf<NonNullable<FakeSdk["config"]["cookieless_mode"]>>().toExtend<
  NonNullable<PostHogConfig["cookieless_mode"]>
>();
expectTypeOf<NonNullable<FakeSdk["config"]["person_profiles"]>>().toExtend<
  NonNullable<PostHogConfig["person_profiles"]>
>();

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: { research: posthog({ sdk: posthogJs }) },
});

expectTypeOf(
  trace.destination("research").native,
).toEqualTypeOf<PostHog | null>();

export const getFeatureFlag =
  trace.destination("research").native?.getFeatureFlag;

posthog({
  // @ts-expect-error An object that is not posthog-js is refused.
  sdk: { capture: () => undefined },
});

posthog({
  // @ts-expect-error The React Native client has its own package.
  sdk: reactNativeClient,
});

posthog({
  // @ts-expect-error The Node client holds no person between calls; it has its own package.
  sdk: nodeClient,
});
