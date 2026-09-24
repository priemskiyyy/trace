import type { SegmentLike } from "src/types/SegmentLike";

/**
 * Options for `segment()`: the analytics-node client the application
 * constructed, the one Trace group type that Segment's group stands for, and
 * the visitor id of the request.
 *
 * @example
 * ```ts
 * segment({ sdk: analytics, group: { type: "workspace" }, anonymousId: "visitor_7" });
 * ```
 */
export type SegmentAdapterOptions<TSdk extends SegmentLike> = {
  /** The `Analytics` client the application constructed. It is also `native`. */
  sdk: TSdk;
  /** The Trace group type sent as Segment's group. Without it, no membership is sent. */
  group?: { type: string };
  /** The visitor id the application keeps for signed-out traffic, such as a cookie. Every call carries it, beside the user id once there is one. */
  anonymousId?: string;
};
