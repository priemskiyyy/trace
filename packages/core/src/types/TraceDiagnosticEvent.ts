import type { TraceDiagnosticType } from "src/types/TraceDiagnosticType";

/**
 * One thing that happened inside Trace, named by a phrase from a closed list
 * such as `event accepted` or `identity step failed`. It never carries event
 * data, a trait value or a provider's error.
 *
 * @example
 * ```ts
 * trace.diagnostics.events.subscribe((event) => console.debug(event.type, event.context));
 * ```
 */
export type TraceDiagnosticEvent = {
  source: "runtime" | "identity" | "consent" | "event" | "destination";
  type: TraceDiagnosticType;
  destination: { name: string } | null;
  event: { id: string } | null;
  timestamp: number;
  /** Frozen plain detail: ids, names, reasons, counts and the paths of what was lost. */
  context: unknown;
};
