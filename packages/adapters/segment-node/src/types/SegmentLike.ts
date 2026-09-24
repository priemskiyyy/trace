import type { SegmentIdentity } from "src/types/SegmentIdentity";

/**
 * The part of analytics-node's `Analytics` client the adapter calls. The client
 * the application constructed satisfies it, so this package imports no SDK:
 * the application passes in the one it created.
 *
 * @example
 * ```ts
 * import { Analytics } from "@segment/analytics-node";
 *
 * const analytics = new Analytics({ writeKey: "YOUR_WRITE_KEY" });
 * const sdk: SegmentLike = analytics;
 * ```
 */
export type SegmentLike = {
  /** Queues the event for its next batch, stamped with the ids on the call; a call with neither id throws. */
  track: (
    call: SegmentIdentity & {
      event: string;
      properties: Record<string, unknown>;
      timestamp: Date;
      messageId: string;
    },
  ) => void;
  /** Sends the traits for the ids on the call; Segment removes a trait sent as `null`. */
  identify: (
    call: SegmentIdentity & { traits: Record<string, unknown> },
  ) => void;
  /** Sends the membership and the group's traits for the ids on the call. */
  group: (
    call: SegmentIdentity & {
      groupId: string;
      traits: Record<string, unknown>;
    },
  ) => void;
  /** Resolves once every pending call was sent or failed. A call made while one runs resolves at once. */
  flush: () => Promise<void>;
};
