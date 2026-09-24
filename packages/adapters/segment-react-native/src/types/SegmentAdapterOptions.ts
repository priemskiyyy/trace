import type { SegmentLike } from "src/types/SegmentLike";

/**
 * Options for `segment()`: the analytics-react-native client the application
 * created, and the one Trace group type that Segment's group stands for.
 *
 * @example
 * ```ts
 * segment({ sdk: client, group: { type: "workspace" } });
 * ```
 */
export type SegmentAdapterOptions<TSdk extends SegmentLike> = {
  /** The client `createClient` answered; the destination opens once its `isReady.value` is true. It is also `native`. */
  sdk: TSdk;
  /** The Trace group type sent as Segment's group. Without it, no membership is sent. */
  group?: { type: string };
};
