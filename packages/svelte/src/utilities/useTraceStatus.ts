import type { TraceStatus } from "@priemskiyyy/trace";
import type { ReadableValue } from "../types/ReadableValue.js";
import { useObservableValue } from "./internal/useObservableValue.svelte.js";
import { useTrace } from "./useTrace.js";

const IDLE_TRACE_STATUS = Object.freeze({
  state: "idle",
}) satisfies TraceStatus;

/**
 * Observes the Trace through `current`: `idle`, `started` or `disposed`. It
 * only observes, never starting the Trace, opening a destination or tracking
 * an event, and reads `idle` on the server and until the component is mounted.
 *
 * @example
 * ```ts
 * const status = useTraceStatus();
 *
 * const isDisposed = $derived(status.current.state === "disposed");
 * ```
 */
export const useTraceStatus = (
  onChange?: (status: TraceStatus) => void | Promise<unknown>,
): ReadableValue<TraceStatus> => {
  const trace = useTrace();

  return useObservableValue<TraceStatus>(
    () => trace.current.status,
    IDLE_TRACE_STATUS,
    onChange,
  );
};
