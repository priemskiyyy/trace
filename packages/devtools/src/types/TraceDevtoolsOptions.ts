import type { ObservedTrace } from "src/types/internal/ObservedTrace";

/**
 * Options of `TraceDevtools`: the Trace to inspect and how the panel starts.
 * Typing the Trace down to what the inspector reads is what keeps it passive.
 *
 * @example
 * ```ts
 * const options: TraceDevtoolsOptions = { trace, initialIsOpen: true, maxEvents: 500 };
 * ```
 */
export type TraceDevtoolsOptions = {
  /** The Trace to inspect. Only its `diagnostics` and `events` are ever read. */
  trace: ObservedTrace;
  /** Opens the panel on the first visit. Later visits restore the last open state. */
  initialIsOpen?: boolean;
  /** Events kept in memory. Defaults to 200, clamped to 1 to 1000. */
  maxEvents?: number;
};
