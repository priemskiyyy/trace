/**
 * The part of analytics-next's `Analytics` the adapter calls. The instance
 * `AnalyticsBrowser.load` resolves with satisfies it, so this package imports
 * no SDK: the application passes in the one it loaded.
 *
 * @example
 * ```ts
 * import { AnalyticsBrowser } from "@segment/analytics-next";
 *
 * const [analytics] = await AnalyticsBrowser.load({ writeKey });
 * const sdk: SegmentLike = analytics;
 * ```
 */
export type SegmentLike = {
  /** Set once `AnalyticsBrowser.load` has registered its plugins, and by a client loaded with `disable` too. */
  initialized: boolean;
  /**
   * Stamps the event at the call with its anonymous id and the user it holds,
   * if any; an event without a user takes the user held when it is sent, at
   * every attempt, retries included. The promise settles after the first
   * attempt.
   */
  track: (
    name: string,
    properties: Record<string, unknown>,
    options: { timestamp: Date; messageId: string },
  ) => Promise<unknown>;
  /** Takes a user id, or traits for the user it holds, merged into the traits it keeps; Segment removes a trait sent as `null`. */
  identify: (idOrTraits: string | Record<string, unknown>) => Promise<unknown>;
  /** Keeps one group: a new id replaces the group and its traits. */
  group: (id: string, traits: Record<string, unknown>) => Promise<unknown>;
  /** Forgets the user, the anonymous id, the traits and the group. */
  reset: () => unknown;
};
