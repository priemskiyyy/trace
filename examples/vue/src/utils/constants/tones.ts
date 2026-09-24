import type { TraceStatus } from "@priemskiyyy/trace";
import type { Tone } from "example-shared/ui/types/Tone";

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

export const TRACE_STATUS_TONES: Record<TraceStatus["state"], Tone> = {
  idle: "warning",
  started: "positive",
  disposed: "neutral",
};
