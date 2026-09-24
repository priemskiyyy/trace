import { event, Trace } from "@priemskiyyy/trace";
import type { Analytics } from "@segment/analytics-next";
import type { Analytics as NodeAnalytics } from "@segment/analytics-node";
import { createClient } from "@segment/analytics-react-native";
import type { SegmentClient } from "@segment/analytics-react-native";
import { expectTypeOf } from "vitest";

import type { fakeSegment } from "src/fakeSegment.fixture";
import { segment } from "src/segment";
import type { SegmentLike } from "src/types/SegmentLike";

type ModelledMember =
  | "identify"
  | "group"
  | "reset"
  | "flush"
  | "pendingEvents"
  | "pauseEventProcessing"
  | "resumeEventProcessing"
  | "init"
  | "cleanup";

type FakeSdk = ReturnType<typeof fakeSegment>["sdk"];

type FakeTrack = FakeSdk["track"];
type RealTrack = SegmentClient["track"];

type FakeRunning = FakeSdk["running"];
type RealRunning = SegmentClient["running"];

declare const client: SegmentClient;
declare const browser: Analytics;
declare const nodeClient: NodeAnalytics;

export const sdk: SegmentLike = client;
export const created: SegmentLike = createClient({
  writeKey: "YOUR_WRITE_KEY",
});

expectTypeOf<FakeSdk>().toExtend<SegmentLike>();
expectTypeOf<keyof FakeSdk>().toExtend<keyof SegmentClient>();
expectTypeOf<FakeSdk>().toExtend<Pick<SegmentClient, ModelledMember>>();
expectTypeOf<FakeTrack>().toExtend<SegmentLike["track"]>();
// @ts-expect-error The real track hands its enrichment a SegmentEvent, whose type is an enum no fake builds without a cast; both extend SegmentLike's.
expectTypeOf<FakeTrack>().toExtend<RealTrack>();
expectTypeOf<FakeSdk["isReady"]["value"]>().toEqualTypeOf<
  SegmentClient["isReady"]["value"]
>();
expectTypeOf<FakeSdk["enabled"]["set"]>().toExtend<
  SegmentClient["enabled"]["set"]
>();
expectTypeOf<keyof FakeRunning>().toExtend<keyof RealRunning>();
expectTypeOf<FakeRunning["onChange"]>().toExtend<RealRunning["onChange"]>();
expectTypeOf(client.running.get()).toEqualTypeOf<
  ReturnType<FakeRunning["get"]>
>();
// @ts-expect-error The real get is overloaded to answer a promise when it is passed true, which the adapter never asks for; both extend SegmentLike's.
expectTypeOf<FakeRunning["get"]>().toExtend<RealRunning["get"]>();

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: {
    segment: segment({ sdk: client, group: { type: "workspace" } }),
  },
});

expectTypeOf(
  trace.destination("segment").native,
).toEqualTypeOf<SegmentClient | null>();

export const screen = trace.destination("segment").native?.screen;

segment({
  // @ts-expect-error An object that is not analytics-react-native is refused.
  sdk: { track: () => Promise.resolve() },
});

segment({
  // @ts-expect-error The browser SDK, analytics-next, has its own package.
  sdk: browser,
});

segment({
  // @ts-expect-error The Node client holds no user between calls; it has its own package.
  sdk: nodeClient,
});

// @ts-expect-error The group option is an object naming the type, not the type alone.
segment({ sdk: client, group: "workspace" });
