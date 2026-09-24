import type { DestinationFlushResult } from "src/types/DestinationFlushResult";

/**
 * What `flush()` reached: whether every destination finished inside the time,
 * and each destination's result.
 *
 * @example
 * ```ts
 * const { drained, destinations } = await trace.flush({ timeout: 1_000 });
 * ```
 */
export type TraceFlushResult<TName extends string = string> = {
  /** False when a destination ran out of time or was not ready. It proves nothing about delivery. */
  drained: boolean;
  destinations: Partial<Record<TName, DestinationFlushResult>>;
};
