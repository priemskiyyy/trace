import type { TrackedEventOf } from "src/types/TrackedEventOf";

/**
 * The stream of accepted events, each delivered after its acceptance and before
 * any destination receives it. It never replays, and subscribing creates no demand.
 *
 * @example
 * ```ts
 * const stop = trace.events.subscribe((event) => console.log(event.name));
 * ```
 */
export type TraceEvents<TEvents> = {
  subscribe: (listener: (event: TrackedEventOf<TEvents>) => void) => () => void;
};
