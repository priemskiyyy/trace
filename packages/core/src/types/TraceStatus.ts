/**
 * Where the Trace stands: `idle` until `start()`, then `started`, and `disposed`
 * for good. The values are interned, so they compare by identity.
 *
 * @example
 * ```ts
 * const started = trace.status.get().state === "started";
 * ```
 */
export type TraceStatus =
  { state: "idle" } | { state: "started" } | { state: "disposed" };
