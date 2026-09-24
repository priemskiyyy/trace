import type { DestinationStatus, TraceStatus } from "@priemskiyyy/trace";
import type { Tone } from "example-shared/ui/types/Tone";

import type { NetworkRequest } from "example-shared/backend/types/NetworkRequest";
import type { OutcomeStatus } from "src/types/OutcomeStatus";

export const OUTCOME_TONES: Record<OutcomeStatus, Tone> = {
  pending: "info",
  submitted: "positive",
  skipped: "warning",
  dropped: "neutral",
  failed: "danger",
  indeterminate: "warning",
  "not-routed": "neutral",
};

export const DESTINATION_STATUS_TONES: Record<
  DestinationStatus["state"],
  Tone
> = {
  idle: "neutral",
  ready: "positive",
  failed: "danger",
  disposed: "neutral",
};

export const TRACE_STATUS_TONES: Record<TraceStatus["state"], Tone> = {
  idle: "warning",
  started: "positive",
  disposed: "neutral",
};

export const REQUEST_TONES: Record<NetworkRequest["outcome"], Tone> = {
  accepted: "positive",
  failed: "danger",
  aborted: "warning",
};
