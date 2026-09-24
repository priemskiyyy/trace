import type { RudderStackLike } from "src/types/RudderStackLike";

/**
 * Options for `rudderstack()`: the RudderStack instance the application
 * created, and the one Trace group type that RudderStack's single group stands
 * for.
 *
 * @example
 * ```ts
 * rudderstack({ sdk: rudderanalytics, group: { type: "workspace" } });
 * ```
 */
export type RudderStackAdapterOptions<TSdk extends RudderStackLike> = {
  /** The `RudderAnalytics` instance the application created and loads. It is also `native`. */
  sdk: TSdk;
  /** The Trace group type sent as RudderStack's group. Without it, no membership is sent. */
  group?: { type: string };
};
