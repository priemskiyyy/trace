/**
 * What an adapter's `track` receives beside the event: an abort signal for the
 * call, the identity generation now and the Trace's clock.
 *
 * @example
 * ```ts
 * track: (event, { now }) =>
 *   now() - event.timestamp > FIVE_DAYS ? { status: "dropped", reason: "provider-filtered" } : send(event),
 * ```
 */
export type TrackContext = {
  /** Aborts at the timeout and on disposal, so a provider call can stop waiting. */
  signal: AbortSignal;
  /** The identity generation now, compared with `event.identity.generation` before an account-dependent call. */
  currentGeneration: () => number;
  /** The Trace's clock, the `now` option guarded; an adapter reads time only from it. */
  now: () => number;
};
