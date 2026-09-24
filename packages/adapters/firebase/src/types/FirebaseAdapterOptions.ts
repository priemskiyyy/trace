import type { FirebaseLike } from "src/types/FirebaseLike";
import type { Ga4EventMap } from "src/types/Ga4EventMap";

/**
 * Options for `firebase()`.
 *
 * @example
 * ```ts
 * firebase({ sdk: FirebaseAnalytics, analytics, map: ga4(events, mappings) });
 * ```
 */
export type FirebaseAdapterOptions<TAnalytics> = {
  /** The Firebase modular analytics API, passed as its namespace. */
  sdk: FirebaseLike<TAnalytics>;
  /** The instance the application created after `isSupported()`; it is also `native`. */
  analytics: TAnalytics;
  /** The GA4 event each Trace event becomes; `ga4()` builds it from the registry. */
  map: Ga4EventMap;
};
