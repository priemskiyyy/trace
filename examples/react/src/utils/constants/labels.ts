import type { DestinationStatus, TraceStatus } from "@priemskiyyy/trace";

import type { NetworkRequest } from "example-shared/backend/types/NetworkRequest";
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

export const DESTINATION_STATUS_LABELS: Record<
  DestinationStatus["state"],
  string
> = {
  idle: "Waiting for start",
  ready: "Ready",
  failed: "Start failed",
  disposed: "Disposed",
};

export const TRACE_STATUS_LABELS: Record<TraceStatus["state"], string> = {
  idle: "Not started",
  started: "Started",
  disposed: "Disposed",
};

export const REQUEST_LABELS: Record<NetworkRequest["outcome"], string> = {
  accepted: "202",
  failed: "503",
  aborted: "Aborted",
};
