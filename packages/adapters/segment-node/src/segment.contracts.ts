import { event, Trace } from "@priemskiyyy/trace";
import type { Analytics as BrowserAnalytics } from "@segment/analytics-next";
import type { Analytics } from "@segment/analytics-node";
import type { SegmentClient } from "@segment/analytics-react-native";
import { expectTypeOf } from "vitest";

import type { fakeSegment } from "src/fakeSegment.fixture";
import { segment } from "src/segment";
import type { SegmentIdentity } from "src/types/SegmentIdentity";
import type { SegmentLike } from "src/types/SegmentLike";

type FakeSdk = ReturnType<typeof fakeSegment>["sdk"];

declare const analytics: Analytics;
declare const browserAnalytics: BrowserAnalytics;
declare const reactNativeClient: SegmentClient;

export const sdk: SegmentLike = analytics;

expectTypeOf<FakeSdk>().toExtend<SegmentLike>();
expectTypeOf<keyof FakeSdk>().toExtend<keyof Analytics>();
expectTypeOf<Parameters<FakeSdk["track"]>>().toExtend<
  Parameters<Analytics["track"]>
>();
expectTypeOf<Parameters<FakeSdk["identify"]>>().toExtend<
  Parameters<Analytics["identify"]>
>();
expectTypeOf<Parameters<FakeSdk["group"]>>().toExtend<
  Parameters<Analytics["group"]>
>();
expectTypeOf<Parameters<FakeSdk["flush"]>>().toExtend<
  Parameters<Analytics["flush"]>
>();
expectTypeOf<Parameters<FakeSdk["closeAndFlush"]>>().toExtend<
  Parameters<Analytics["closeAndFlush"]>
>();
expectTypeOf<Parameters<FakeSdk["register"]>>().toExtend<
  Parameters<Analytics["register"]>
>();
expectTypeOf<ReturnType<FakeSdk["track"]>>().toEqualTypeOf<
  ReturnType<Analytics["track"]>
>();
expectTypeOf<ReturnType<FakeSdk["flush"]>>().toEqualTypeOf<
  ReturnType<Analytics["flush"]>
>();

// The adapter cannot hand analytics-node a flush timeout, which aborts the batches in flight.
expectTypeOf<Parameters<SegmentLike["flush"]>>().toEqualTypeOf<[]>();

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: {
    segment: segment({
      sdk: analytics,
      group: { type: "workspace" },
      anonymousId: "visitor-7",
    }),
  },
});

expectTypeOf(
  trace.destination("segment").native,
).toEqualTypeOf<Analytics | null>();

export const closeAndFlush = trace.destination("segment").native?.closeAndFlush;

segment({
  // @ts-expect-error An object that is not analytics-node is refused.
  sdk: { track: () => {} },
});

segment({
  // @ts-expect-error analytics-next holds a user between calls; it has its own package.
  sdk: browserAnalytics,
});

segment({
  // @ts-expect-error The React Native client has its own package.
  sdk: reactNativeClient,
});

// @ts-expect-error The group option is an object naming the type, not the type alone.
segment({ sdk: analytics, group: "workspace" });

segment({
  sdk: analytics,
  // @ts-expect-error The anonymous id is the visitor's id itself, not a function that finds it.
  anonymousId: () => "visitor-7",
});

// @ts-expect-error analytics-node takes no call without a user id or an anonymous id.
export const nobody: SegmentIdentity = {};
