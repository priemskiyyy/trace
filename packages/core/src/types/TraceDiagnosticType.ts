import type { DIAGNOSTIC_TYPES } from "src/utils/constants/diagnostics";

/**
 * The closed list of phrases a diagnostic event's `type` can be, from
 * `trace started` to `listener failed`, so a consumer can dispatch on it
 * exhaustively.
 *
 * @example
 * ```ts
 * const failures: TraceDiagnosticType[] = ["destination failed", "event failed", "listener failed"];
 * ```
 */
export type TraceDiagnosticType =
  (typeof DIAGNOSTIC_TYPES)[keyof typeof DIAGNOSTIC_TYPES];
