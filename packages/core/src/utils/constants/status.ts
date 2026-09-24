import type { DestinationStatus } from "src/types/DestinationStatus";
import type { TraceStatus } from "src/types/TraceStatus";

/** A Trace before `start()`, interned so observers compare statuses by identity. */
export const IDLE_TRACE_STATUS = Object.freeze({
  state: "idle",
}) satisfies TraceStatus;

/** A Trace after `start()`, interned so observers compare statuses by identity. */
export const STARTED_TRACE_STATUS = Object.freeze({
  state: "started",
}) satisfies TraceStatus;

/** A Trace after `dispose()`, interned so observers compare statuses by identity. */
export const DISPOSED_TRACE_STATUS = Object.freeze({
  state: "disposed",
}) satisfies TraceStatus;

/** A destination not opened yet, interned so observers compare statuses by identity. */
export const IDLE_DESTINATION_STATUS = Object.freeze({
  state: "idle",
}) satisfies DestinationStatus;

/** A destination whose session opened, interned so observers compare statuses by identity. */
export const READY_DESTINATION_STATUS = Object.freeze({
  state: "ready",
}) satisfies DestinationStatus;

/** A destination after its lane was disposed, interned so observers compare statuses by identity. */
export const DISPOSED_DESTINATION_STATUS = Object.freeze({
  state: "disposed",
}) satisfies DestinationStatus;
