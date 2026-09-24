/**
 * Why an event never reached a destination: its properties were `invalid`, its
 * data could not be sanitized, consent closed every candidate, routing selected
 * none, it was tracked from inside an adapter call or a listener, or after `dispose()`.
 *
 * @example
 * ```ts
 * const status = trace.track("App Opened").status.get();
 * const reason: DropReason | null = status.state === "dropped" ? status.reason : null;
 * ```
 */
export type DropReason =
  | "invalid"
  | "sanitizer-failed"
  | "consent"
  | "not-routed"
  | "reentrant"
  | "disposed";
