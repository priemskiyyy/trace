/**
 * What went wrong, for an error Trace or an adapter created: options that cannot
 * work, an SDK not initialized yet, an update the provider cannot perform, an
 * adapter answer outside its contract, or an SDK that swallowed its own error.
 *
 * @example
 * ```ts
 * const code: TraceErrorCode = "NOT_INITIALIZED";
 * ```
 */
export type TraceErrorCode =
  | "INVALID_CONFIGURATION"
  | "NOT_INITIALIZED"
  | "UNSUPPORTED"
  | "INVALID_ANSWER"
  | "DELIVERY_FAILED";
