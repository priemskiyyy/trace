import type { TraceStatus } from "@priemskiyyy/trace";
import type { Accessor } from "solid-js";

import { useObservableValue } from "src/primitives/internal/useObservableValue";
import { useTrace } from "src/primitives/useTrace";

const IDLE_TRACE_STATUS = Object.freeze({
  state: "idle",
}) satisfies TraceStatus;

/**
 * Observes the Trace as an accessor: `idle`, `started` or `disposed`. It only
 * observes, never starting the Trace, opening a destination or tracking an
 * event, and reads `idle` on the server and until the component is mounted.
 *
 * @example
 * ```tsx
 * const status = useTraceStatus();
 *
 * <Show when={status().state !== "disposed"}>{children}</Show>;
 * ```
 */
export const useTraceStatus = (
  onChange?: (status: TraceStatus) => void | Promise<unknown>,
): Accessor<TraceStatus> => {
  const trace = useTrace();

  return useObservableValue<TraceStatus>(
    () => trace().status,
    IDLE_TRACE_STATUS,
    onChange,
  );
};
