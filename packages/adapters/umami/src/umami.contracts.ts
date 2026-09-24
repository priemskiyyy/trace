import { event, Trace } from "@priemskiyyy/trace";
import * as Vercel from "@vercel/analytics";
import { expectTypeOf } from "vitest";

import type { fakeUmami } from "src/fakeUmami.fixture";
import type { UmamiLike } from "src/types/UmamiLike";
import { umami } from "src/umami";

type FakeSdk = ReturnType<typeof fakeUmami>["sdk"];

type RealTracker = typeof window.umami;

type RealEventFunction = Parameters<RealTracker["track"]>[0];

type EventFunction = Parameters<UmamiLike["track"]>[0];

type RealEventData = NonNullable<ReturnType<RealEventFunction>["data"]>;

export const sdk: UmamiLike = window.umami;

expectTypeOf<Parameters<RealEventFunction>[0]>().toExtend<
  Parameters<EventFunction>[0]
>();
expectTypeOf<Omit<ReturnType<EventFunction>, "data">>().toExtend<
  Omit<ReturnType<RealEventFunction>, "data">
>();
expectTypeOf<FakeSdk>().toExtend<UmamiLike>();
expectTypeOf<FakeSdk>().toExtend<Pick<RealTracker, "track" | "identify">>();

// @ts-expect-error @types/umami-browser 2.18.1 types event data without null or mixed arrays, which the tracker sends as given.
expectTypeOf<Record<string, unknown>>().toExtend<RealEventData>();

// @ts-expect-error @types/umami-browser 2.18.1 has no id on a payload, which the tracker 3.4.0 sends as the event's distinct id.
expectTypeOf<ReturnType<RealEventFunction>>().toHaveProperty("id");

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: { site: umami({ sdk: window.umami }) },
});

expectTypeOf(
  trace.destination("site").native,
).toEqualTypeOf<RealTracker | null>();

export const identify = trace.destination("site").native?.identify;

// @ts-expect-error Vercel's track takes an event name, not a function of Umami's payload.
umami({ sdk: Vercel });
