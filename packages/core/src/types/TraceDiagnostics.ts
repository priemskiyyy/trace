import type { ObservableValue } from "src/types/ObservableValue";
import type { TraceDiagnosticEvent } from "src/types/TraceDiagnosticEvent";
import type { TraceSnapshot } from "src/types/TraceSnapshot";

/**
 * A passive view for devtools: the snapshot as an observable value, and a
 * timeline of diagnostic events that is assembled only while someone listens.
 *
 * @example
 * ```ts
 * const stop = trace.diagnostics.subscribe(() => render(trace.diagnostics.get()));
 * ```
 */
export type TraceDiagnostics = ObservableValue<TraceSnapshot> & {
  events: {
    subscribe: (listener: (event: TraceDiagnosticEvent) => void) => () => void;
  };
};
