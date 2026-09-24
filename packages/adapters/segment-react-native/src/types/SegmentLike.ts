/**
 * The part of an analytics-react-native `SegmentClient` the adapter calls.
 * The client `createClient` answers satisfies it, so this package imports no
 * SDK: the application passes in the one it created.
 *
 * @example
 * ```ts
 * import { createClient } from "@segment/analytics-react-native";
 *
 * const sdk: SegmentLike = createClient({ writeKey: "YOUR_WRITE_KEY" });
 * ```
 */
export type SegmentLike = {
  /** Turns true once the client has restored its storage and loaded its settings. */
  isReady: { value: boolean };
  /** False until initialization ends and while a plugin pauses processing, when the client holds events and `identify` calls but applies `reset` at once. */
  running: { get: () => boolean };
  /**
   * Stamps the event with the user and anonymous id the client holds when it
   * processes the event, which is at the call while the client is ready and
   * running, runs the enrichment over it, and settles once the event is
   * queued, or held.
   *
   * A method, so that Segment's JSON-typed properties accept the event's,
   * which are plain JSON by construction but typed `unknown`.
   */
  track(
    name: string,
    properties?: Record<string, unknown>,
    enrichment?: <TEvent extends { messageId?: string; timestamp?: string }>(
      event: TEvent,
    ) => TEvent,
  ): Promise<void>;
  /**
   * Holds the user, or keeps the one it holds for `undefined`, merges the
   * traits into those it keeps, and settles once the identify is queued;
   * Segment removes a trait sent as `null`.
   *
   * A method, so that Segment's JSON-typed traits accept the update's, which
   * are plain JSON by construction but typed `unknown`.
   */
  identify(userId?: string, traits?: Record<string, unknown>): Promise<void>;
  /**
   * Keeps no group of its own: each call is one group event, which settles
   * once it is queued.
   *
   * A method, so that Segment's JSON-typed traits accept the group's, which
   * are plain JSON by construction but typed `unknown`.
   */
  group(id: string, traits?: Record<string, unknown>): Promise<void>;
  /** Forgets the user and the traits and starts a new anonymous id, settling once it has. */
  reset: () => Promise<void>;
  /** Stops the client from queueing any event while it is `false`, a setting it keeps across launches. */
  enabled: { set: (enabled: boolean) => boolean | Promise<boolean> };
  /** Uploads the queue and settles after the attempt, keeping what failed for a retry; it never rejects. */
  flush: () => Promise<void>;
  /** Counts the events still queued for upload. */
  pendingEvents: () => Promise<number>;
};
