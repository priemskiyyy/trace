import type { TraceStatus } from "@priemskiyyy/trace";

import { useObservableValue } from "src/hooks/internal/useObservableValue";
import { useTrace } from "src/hooks/useTrace";

// Interned so the server snapshot is one reference per render.
const IDLE_TRACE_STATUS = Object.freeze({
  state: "idle",
}) satisfies TraceStatus;

/**
 * Observes the Trace: `idle`, `started` or `disposed`. It only observes: it
 * never starts the Trace, opens a destination or tracks an event, and it reads
 * `idle` on the server and during hydration.
 *
 * @example
 * ```tsx
 * const status = useTraceStatus();
 *
 * if (status.state === "disposed") return null;
 * ```
 */
export const useTraceStatus = (
  onChange?: (status: TraceStatus) => void | Promise<unknown>,
): TraceStatus => {
  const trace = useTrace();

  return useObservableValue(trace.status, () => IDLE_TRACE_STATUS, onChange);
};
