import { expectTypeOf } from "vitest";

import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { AnalyticsSession } from "src/types/AnalyticsSession";
import type { TrackResult } from "src/types/TrackResult";

const SUBMITTED: TrackResult = {
  status: "submitted",
  evidence: "sdk-call-returned",
};

expectTypeOf<keyof AnalyticsAdapter>().toEqualTypeOf<"name" | "open">();
expectTypeOf<keyof AnalyticsSession>().toEqualTypeOf<
  | "native"
  | "track"
  | "identify"
  | "traits"
  | "group"
  | "reset"
  | "collection"
  | "flush"
  | "dispose"
>();

export const initializing: AnalyticsAdapter = {
  name: "initializing",
  open: () => ({ native: null, track: () => SUBMITTED }),
  // @ts-expect-error An adapter takes an SDK the application initialized, so it has no init.
  init: () => {},
};

export const loading: AnalyticsAdapter = {
  name: "loading",
  open: () => ({ native: null, track: () => SUBMITTED }),
  // @ts-expect-error An adapter never loads its SDK; the application does.
  load: () => {},
};

export const shuttingDown: AnalyticsSession = {
  native: null,
  track: () => SUBMITTED,
  // @ts-expect-error A session never shuts the SDK down; the application owns it.
  shutdown: () => {},
};

export const closing: AnalyticsSession = {
  native: null,
  track: () => SUBMITTED,
  // @ts-expect-error A session never closes the SDK; dispose releases only what the adapter holds.
  close: () => {},
};
