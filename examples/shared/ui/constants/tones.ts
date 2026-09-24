import type {
  ConsentDecision,
  DestinationStatus,
  ReceiptStatus,
  TraceStatus,
} from "@priemskiyyy/trace";

import type { NetworkRequest } from "example-shared/backend/types/NetworkRequest";
import type { CollectionState } from "example-shared/boutique/reporting/types/CollectionState";
import type { OutcomeStatus } from "example-shared/boutique/reporting/types/OutcomeStatus";
import type { Tone } from "example-shared/ui/types/Tone";

export const OUTCOME_TONES: Record<OutcomeStatus, Tone> = {
  pending: "info",
  submitted: "positive",
  skipped: "warning",
  dropped: "neutral",
  failed: "danger",
  indeterminate: "warning",
  "not-routed": "neutral",
};

export const RECEIPT_TONES: Record<ReceiptStatus["state"], Tone> = {
  pending: "info",
  settled: "positive",
  dropped: "neutral",
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

export const CONSENT_TONES: Record<ConsentDecision, Tone> = {
  unknown: "warning",
  granted: "positive",
  denied: "neutral",
};

export const COLLECTION_TONES: Record<CollectionState, Tone> = {
  collecting: "positive",
  off: "neutral",
  none: "neutral",
};

export const REQUEST_TONES: Record<NetworkRequest["outcome"], Tone> = {
  accepted: "positive",
  failed: "danger",
  aborted: "warning",
};
