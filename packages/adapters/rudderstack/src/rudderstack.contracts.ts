import { event, Trace } from "@priemskiyyy/trace";
import type {
  RudderAnalytics,
  RudderAnalyticsPreloader,
} from "@rudderstack/analytics-js";
import { expectTypeOf } from "vitest";

import type { fakeRudderStack } from "src/fakeRudderStack.fixture";
import { rudderstack } from "src/rudderstack";
import type { RudderStackLike } from "src/types/RudderStackLike";

type FakeSdk = ReturnType<typeof fakeRudderStack>["sdk"];

type FakeCall<TMethod extends keyof FakeSdk> = Parameters<FakeSdk[TMethod]>;

type IdentifyFirst = FakeCall<"identify">[0];

declare const rudderanalytics: RudderAnalytics;
declare const snippet: RudderAnalytics | RudderAnalyticsPreloader | undefined;
declare const track: FakeCall<"track">;
declare const userId: Extract<IdentifyFirst, string>;
declare const userTraits: NonNullable<FakeCall<"identify">[1]>;
declare const traits: Exclude<IdentifyFirst, string>;
declare const group: FakeCall<"group">;
declare const reset: FakeCall<"reset">;
declare const load: FakeCall<"load">;

export const sdk: RudderStackLike = rudderanalytics;

expectTypeOf<FakeSdk>().toExtend<RudderStackLike>();
expectTypeOf<keyof FakeSdk>().toExtend<keyof RudderAnalytics>();

// Every call form the fake models is one RudderStack's overloads take.
rudderanalytics.track(...track);
rudderanalytics.identify(userId, userTraits);
rudderanalytics.identify(traits);
rudderanalytics.group(...group);
rudderanalytics.reset(...reset);
rudderanalytics.load(...load);

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: {
    warehouse: rudderstack({
      sdk: rudderanalytics,
      group: { type: "workspace" },
    }),
  },
});

expectTypeOf(
  trace.destination("warehouse").native,
).toEqualTypeOf<RudderAnalytics | null>();

export const getAnonymousId =
  trace.destination("warehouse").native?.getAnonymousId;

rudderstack({
  // @ts-expect-error An object that is not RudderStack's SDK is refused.
  sdk: { track: () => undefined },
});

rudderstack({
  // @ts-expect-error window.rudderanalytics may still be the snippet's preload buffer or missing; pass the RudderAnalytics instance.
  sdk: snippet,
});

// @ts-expect-error The group option is an object naming the type, not the type alone.
rudderstack({ sdk: rudderanalytics, group: "workspace" });
