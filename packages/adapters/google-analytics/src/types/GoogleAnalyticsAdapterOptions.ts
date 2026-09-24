import type { Ga4EventMap } from "src/types/Ga4EventMap";
import type { GtagLike } from "src/types/GtagLike";

/**
 * Options for `googleAnalytics()`. The Google tag on the page loads gtag.js
 * and configures the measurement; Trace only sends commands to it.
 *
 * @example
 * ```ts
 * googleAnalytics({ sdk: gtag, measurement: { id: "G-XXXXXXX" }, map: ga4(events, mappings) });
 * ```
 */
export type GoogleAnalyticsAdapterOptions<TSdk extends GtagLike> = {
  /** The `gtag` function the Google tag snippet defined; it is also `native`. */
  sdk: TSdk;
  /** The GA4 data stream every event goes to and every user change applies to. */
  measurement: { id: string };
  /** The GA4 event each Trace event becomes; `ga4()` builds it from the registry. */
  map: Ga4EventMap;
};
