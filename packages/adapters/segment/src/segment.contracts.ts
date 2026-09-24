import { event, Trace } from "@priemskiyyy/trace";
import type { Analytics, AnalyticsBrowser } from "@segment/analytics-next";
import type { Analytics as NodeAnalytics } from "@segment/analytics-node";
import type { SegmentClient } from "@segment/analytics-react-native";
import { expectTypeOf } from "vitest";

import type { fakeSegment } from "src/fakeSegment.fixture";
import { segment } from "src/segment";
import type { SegmentLike } from "src/types/SegmentLike";

type FakeSdk = ReturnType<typeof fakeSegment>["sdk"];

declare const analytics: Analytics;
declare const browser: AnalyticsBrowser;
declare const reactNativeClient: SegmentClient;
declare const nodeClient: NodeAnalytics;

export const sdk: SegmentLike = analytics;

expectTypeOf<FakeSdk>().toExtend<SegmentLike>();
expectTypeOf<keyof FakeSdk>().toExtend<keyof Analytics>();
expectTypeOf<FakeSdk["initialized"]>().toEqualTypeOf<
  Analytics["initialized"]
>();
expectTypeOf<FakeSdk["reset"]>().toExtend<Analytics["reset"]>();
expectTypeOf<Parameters<FakeSdk["track"]>>().toExtend<
  Parameters<Analytics["track"]>
>();
expectTypeOf<Parameters<FakeSdk["identify"]>>().toExtend<
  Parameters<Analytics["identify"]>
>();
expectTypeOf<Parameters<FakeSdk["group"]>>().toExtend<
  Parameters<Analytics["group"]>
>();
expectTypeOf<Parameters<FakeSdk["init"]>>().toExtend<
  Parameters<Analytics["init"]>
>();
expectTypeOf<Parameters<FakeSdk["initialize"]>>().toExtend<
  Parameters<Analytics["initialize"]>
>();

type FakeAnswer = ReturnType<FakeSdk["track"]>;
type RealAnswer = ReturnType<Analytics["track"]>;
// @ts-expect-error analytics-next answers its Context class, whose private fields no fake can build; the adapter reads nothing from the answer.
expectTypeOf<FakeAnswer>().toExtend<RealAnswer>();

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: {
    segment: segment({ sdk: analytics, group: { type: "workspace" } }),
  },
});

expectTypeOf(
  trace.destination("segment").native,
).toEqualTypeOf<Analytics | null>();

export const page = trace.destination("segment").native?.page;

segment({
  // @ts-expect-error An object that is not analytics-next is refused.
  sdk: { track: () => Promise.resolve() },
});

segment({
  // @ts-expect-error The AnalyticsBrowser wrapper is refused: Trace takes the Analytics it resolves with once loaded.
  sdk: browser,
});

segment({
  // @ts-expect-error The React Native client has its own package.
  sdk: reactNativeClient,
});

segment({
  // @ts-expect-error The Node client holds no user between calls; it has its own package.
  sdk: nodeClient,
});

// @ts-expect-error The group option is an object naming the type, not the type alone.
segment({ sdk: analytics, group: "workspace" });
