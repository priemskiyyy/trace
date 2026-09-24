import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";

/**
 * Adapters by destination name. The names type `to`, `consent`, receipts and
 * `destination(name)`.
 *
 * @example
 * ```ts
 * const destinations = {
 *   product: amplitude({ sdk: Amplitude, Identify: Amplitude.Identify }),
 * } satisfies Destinations;
 * ```
 */
export type Destinations = Record<string, AnalyticsAdapter>;
