import type { ConsentDecision } from "src/types/ConsentDecision";
import type { ObservableValue } from "src/types/ObservableValue";

/**
 * The decision for each purpose the `consent` option names, and `set` to change
 * them. A destination is open only while every purpose it needs is `granted`.
 *
 * @example
 * ```ts
 * trace.consent.set({ analytics: "granted", advertising: "denied" });
 * ```
 */
export type TraceConsent<TPurpose extends string = string> = ObservableValue<
  Record<TPurpose, ConsentDecision>
> & {
  set: (decisions: Partial<Record<TPurpose, ConsentDecision>>) => void;
};
