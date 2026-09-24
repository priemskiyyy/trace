import type { TrackedEvent } from "@priemskiyyy/trace";

import type { Ga4Event } from "src/types/Ga4Event";

/**
 * The adapter's `map`: the GA4 event each Trace event becomes, or `null` to
 * keep it from Google Analytics. `ga4(events, mappings)` builds one from the
 * registry.
 *
 * @example
 * ```ts
 * const map: Ga4EventMap = ga4(events, mappings);
 * ```
 */
export type Ga4EventMap = (event: TrackedEvent) => Ga4Event | null;
