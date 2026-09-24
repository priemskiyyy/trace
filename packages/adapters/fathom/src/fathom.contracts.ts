import * as Plausible from "@plausible-analytics/tracker";
import { event, Trace } from "@priemskiyyy/trace";
import * as Fathom from "fathom-client";
import { expectTypeOf } from "vitest";

import type { fakeFathom } from "src/fakeFathom.fixture";
import { fathom } from "src/fathom";
import type { FathomLike } from "src/types/FathomLike";

type FakeSdk = ReturnType<typeof fakeFathom>["sdk"];

type ModelledMember =
  | "trackEvent"
  | "load"
  | "setSite"
  | "trackPageview"
  | "trackGoal"
  | "blockTrackingForMe"
  | "enableTrackingForMe";

export const sdk: FathomLike = Fathom;
export const trackEventSdk: FathomLike = { trackEvent: Fathom.trackEvent };

expectTypeOf<FakeSdk>().toExtend<FathomLike>();
expectTypeOf<FakeSdk>().toExtend<Pick<typeof Fathom, ModelledMember>>();
expectTypeOf<
  NonNullable<Parameters<FathomLike["trackEvent"]>[1]>
>().toExtend<Fathom.EventOptions>();

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: { site: fathom({ sdk: Fathom }) },
});

expectTypeOf(trace.destination("site").native).toEqualTypeOf<
  typeof Fathom | null
>();

export const load = trace.destination("site").native?.load;

// @ts-expect-error Plausible's tracker has no trackEvent, so it is not a Fathom client.
fathom({ sdk: Plausible });

// @ts-expect-error A value is a number of cents, never a formatted amount.
fathom({ sdk: Fathom, value: () => "49.50" });
