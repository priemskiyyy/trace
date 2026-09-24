/**
 * Options for one `track`.
 *
 * @example
 * ```ts
 * trace.track("App Opened", undefined, { to: ["product"], context: { screen: "home" } });
 * ```
 */
export type TrackOptions<TName extends string = string> = {
  /** Replaces `defaults.to` for this event. It never merges with it. */
  to?: TName[];
  /** The last context layer, which wins over the others key by key. */
  context?: Record<string, unknown>;
  /** When it happened, in epoch milliseconds, for an event tracked after the fact. The Trace's clock by default. */
  timestamp?: number;
};
