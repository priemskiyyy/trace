import { event, Trace } from "@priemskiyyy/trace";
import posthogJs from "posthog-js";
import type { PostHog as PostHogNode } from "posthog-node";
import PostHog from "posthog-react-native";
import { expectTypeOf } from "vitest";

import type { fakePostHog } from "src/fakePostHog.fixture";
import { posthog } from "src/posthog";
import type { PostHogLike } from "src/types/PostHogLike";

type ModelledMember =
  | "isDisabled"
  | "ready"
  | "capture"
  | "identify"
  | "setPersonProperties"
  | "unsetPersonProperties"
  | "group"
  | "register"
  | "reset"
  | "optIn"
  | "optOut"
  | "flush"
  | "shutdown";

type FakeSdk = ReturnType<typeof fakePostHog>["sdk"];

type FakeRead = FakeSdk["getPersistedProperty"];
type RealRead = PostHog["getPersistedProperty"];

declare const client: PostHog;
declare const nodeClient: PostHogNode;

export const sdk: PostHogLike = client;
export const instance: PostHogLike = new PostHog("phc_project_api_key");

expectTypeOf<FakeSdk>().toExtend<PostHogLike>();
expectTypeOf<keyof FakeSdk>().toExtend<keyof PostHog>();
expectTypeOf<FakeSdk>().toExtend<Pick<PostHog, ModelledMember>>();
expectTypeOf<FakeRead>().toExtend<PostHogLike["getPersistedProperty"]>();
// @ts-expect-error The real getPersistedProperty is generic over the value it reads, which no fake can be without a cast; both extend PostHogLike's.
expectTypeOf<FakeRead>().toExtend<RealRead>();

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: { research: posthog({ sdk: client }) },
});

expectTypeOf(
  trace.destination("research").native,
).toEqualTypeOf<PostHog | null>();

export const getFeatureFlag =
  trace.destination("research").native?.getFeatureFlag;

posthog({
  // @ts-expect-error An object that is not posthog-react-native is refused.
  sdk: { capture: () => undefined },
});

posthog({
  // @ts-expect-error The browser SDK, posthog-js, has its own package.
  sdk: posthogJs,
});

posthog({
  // @ts-expect-error The Node client holds no person between calls; it has its own package.
  sdk: nodeClient,
});
