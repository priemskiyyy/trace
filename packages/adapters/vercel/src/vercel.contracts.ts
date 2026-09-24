import { event, Trace } from "@priemskiyyy/trace";
import * as Vercel from "@vercel/analytics";
import { track as trackOnServer } from "@vercel/analytics/server";
import * as Fathom from "fathom-client";
import { expectTypeOf } from "vitest";

import type { fakeVercel } from "src/fakeVercel.fixture";
import type { VercelLike } from "src/types/VercelLike";
import { vercel } from "src/vercel";

type FakeSdk = ReturnType<typeof fakeVercel>["sdk"];

type Properties = Parameters<VercelLike["track"]>[1];

export const sdk: VercelLike = Vercel;
export const trackSdk: VercelLike = { track: Vercel.track };

expectTypeOf<FakeSdk>().toExtend<VercelLike>();
expectTypeOf<FakeSdk>().toExtend<
  Pick<typeof Vercel, "track" | "inject" | "pageview">
>();
expectTypeOf<Properties>().toExtend<
  NonNullable<Parameters<typeof Vercel.track>[1]>
>();

// The server track takes the same arguments, so the types cannot tell it from the browser one.
export const serverSdk: VercelLike = { track: trackOnServer };

export const trace = new Trace({
  events: { "App Opened": event() },
  destinations: { site: vercel({ sdk: Vercel }) },
});

expectTypeOf(trace.destination("site").native).toEqualTypeOf<
  typeof Vercel | null
>();

export const inject = trace.destination("site").native?.inject;

// @ts-expect-error The Fathom client has no track, so it is not Vercel's.
vercel({ sdk: Fathom });

// @ts-expect-error A limit is a number of properties.
vercel({ sdk: Vercel, limits: { properties: "2" } });

// @ts-expect-error No Vercel plan keeps three properties: Pro keeps 2, Plus and Enterprise 8.
vercel({ sdk: Vercel, limits: { properties: 3 } });

// @ts-expect-error Infinity would turn the cap off, and no plan has none.
vercel({ sdk: Vercel, limits: { properties: Infinity } });
