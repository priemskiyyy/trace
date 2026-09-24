import type { SegmentLike } from "src/types/SegmentLike";

/**
 * Options for `segment()`: the analytics-next instance the application loaded,
 * and the one Trace group type that Segment's single group stands for.
 *
 * @example
 * ```ts
 * segment({ sdk: analytics, group: { type: "workspace" } });
 * ```
 */
export type SegmentAdapterOptions<TSdk extends SegmentLike> = {
  /** The `Analytics` that `AnalyticsBrowser.load` resolved with. It is also `native`. */
  sdk: TSdk;
  /** The Trace group type sent as Segment's group. Without it, no membership is sent. */
  group?: { type: string };
};
