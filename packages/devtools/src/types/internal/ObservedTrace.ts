import type { TraceDiagnostics, TrackedEvent } from "@priemskiyyy/trace";

// Written out rather than picked from Trace, whose registry parameter is invariant, so a Trace typed by its own events fits.
export type ObservedTrace = {
  diagnostics: TraceDiagnostics;
  events: {
    subscribe: (
      listener: (event: TrackedEvent<string, unknown>) => void,
    ) => () => void;
  };
};
