import type { TraceStatus } from "@priemskiyyy/trace";
import type { ComputedRef } from "vue";

import { useObservableValue } from "src/composables/internal/useObservableValue";
import { useTrace } from "src/composables/useTrace";

const IDLE_TRACE_STATUS = Object.freeze({
  state: "idle",
}) satisfies TraceStatus;

/**
 * Observes the Trace as a read-only ref: `idle`, `started` or `disposed`. It
 * only observes, never starting the Trace, opening a destination or tracking
 * an event, and reads `idle` on the server and until the component is mounted.
 *
 * @example
 * ```ts
 * const status = useTraceStatus();
 *
 * const isDisposed = computed(() => status.value.state === "disposed");
 * ```
 */
export const useTraceStatus = (
  onChange?: (status: TraceStatus) => void | Promise<unknown>,
): ComputedRef<TraceStatus> => {
  const trace = useTrace();

  return useObservableValue<TraceStatus>(
    () => trace.value.status,
    IDLE_TRACE_STATUS,
    onChange,
  );
};
