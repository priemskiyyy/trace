import * as Plausible from "@plausible-analytics/tracker";
import { event, Trace } from "@priemskiyyy/trace";
import * as Fathom from "fathom-client";
import { expectTypeOf } from "vitest";

import type { fakePlausible } from "src/fakePlausible.fixture";
import { plausible } from "src/plausible";
import type { PlausibleLike } from "src/types/PlausibleLike";

type FakeSdk = ReturnType<typeof fakePlausible>["sdk"];

type TrackOptions = Parameters<PlausibleLike["track"]>[1];

type NumericProps = {
  track: (name: string, options: { props: Record<string, number> }) => void;
};

declare const numericProps: NumericProps;

export const moduleSdk: PlausibleLike = Plausible;
export const trackSdk: PlausibleLike = { track: Plausible.track };

expectTypeOf<FakeSdk>().toExtend<PlausibleLike>();
expectTypeOf<FakeSdk>().toExtend<Pick<typeof Plausible, "init" | "track">>();
expectTypeOf<
  TrackOptions["props"]
>().toEqualTypeOf<Plausible.CustomProperties>();
expectTypeOf<TrackOptions["callback"]>().toExtend<
  NonNullable<Plausible.PlausibleEventOptions["callback"]>
>();

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: { site: plausible({ sdk: Plausible }) },
});

expectTypeOf(trace.destination("site").native).toEqualTypeOf<
  typeof Plausible | null
>();

export const init = trace.destination("site").native?.init;

// @ts-expect-error The Fathom client has no track, so it is not a Plausible tracker.
plausible({ sdk: Fathom });

// @ts-expect-error Plausible's props are text only, so a track that takes numbers is another tracker.
plausible({ sdk: numericProps });
