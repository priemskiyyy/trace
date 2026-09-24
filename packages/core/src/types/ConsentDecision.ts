/**
 * The decision for one consent purpose. Every purpose starts `unknown`, and only
 * `granted` opens a destination that needs it.
 *
 * @example
 * ```ts
 * const decision: ConsentDecision = trace.consent.get().analytics;
 * ```
 */
export type ConsentDecision = "unknown" | "granted" | "denied";
