import type { TraceStatus } from "@priemskiyyy/trace";

import type { OutcomeStatus } from "src/types/OutcomeStatus";

export const OUTCOME_LABELS: Record<OutcomeStatus, string> = {
  pending: "Sending",
  submitted: "Submitted",
  skipped: "Skipped",
  dropped: "Dropped",
  failed: "Failed",
  indeterminate: "Unconfirmed",
  "not-routed": "Not routed",
};

export const TRACE_STATUS_LABELS: Record<TraceStatus["state"], string> = {
  idle: "Not started",
  started: "Started",
  disposed: "Disposed",
};
