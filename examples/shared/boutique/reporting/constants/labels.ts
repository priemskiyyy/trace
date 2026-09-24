import type {
  ConsentDecision,
  DestinationStatus,
  DropReason,
  ReceiptStatus,
  TraceStatus,
} from "@priemskiyyy/trace";

import type { NetworkRequest } from "example-shared/backend/types/NetworkRequest";
import type { CollectionState } from "example-shared/boutique/reporting/types/CollectionState";
import type { OutcomeStatus } from "example-shared/boutique/reporting/types/OutcomeStatus";

export const OUTCOME_LABELS: Record<OutcomeStatus, string> = {
  pending: "Sending",
  submitted: "Submitted",
  skipped: "Skipped",
  dropped: "Dropped",
  failed: "Failed",
  indeterminate: "Unconfirmed",
  "not-routed": "Not routed",
};

/** What each outcome claims, and nothing more. */
export const OUTCOME_MEANINGS: Record<OutcomeStatus, string> = {
  pending: "Handed over, and its answer has not come back yet.",
  submitted: "Handed over, as far as Trace can see, on the evidence it names.",
  skipped: "Never tried, because it could not have gone there correctly.",
  dropped: "Discarded before it was sent, for a known reason.",
  failed: "Tried, and it definitely failed.",
  indeterminate: "Tried, but whether it arrived cannot be known.",
  "not-routed":
    "Never handed to this destination: consent or routing kept it away.",
};

/** The outcomes a settled receipt can hold, in the order the legend explains them. */
export const OUTCOME_ORDER: OutcomeStatus[] = [
  "submitted",
  "skipped",
  "dropped",
  "failed",
  "indeterminate",
  "not-routed",
];

export const RECEIPT_LABELS: Record<ReceiptStatus["state"], string> = {
  pending: "Sending",
  settled: "Settled",
  dropped: "Not sent",
};

/** Why a receipt reached no destination at all. */
export const DROP_MEANINGS: Record<DropReason, string> = {
  invalid:
    "Its properties failed the event's schema, so no destination saw it.",
  "sanitizer-failed": "It could not be redacted, so it was not sent at all.",
  consent: "No destination it was routed to has consent, so it went nowhere.",
  "not-routed": "Routing chose no destination for it.",
  reentrant:
    "It was tracked from inside a destination, which could loop forever.",
  disposed: "The demo restarted before it could be sent.",
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

export const CONSENT_LABELS: Record<ConsentDecision, string> = {
  unknown: "Waiting for an answer",
  granted: "Analytics granted",
  denied: "Analytics declined",
};

/** What each analytics consent decision means for Boutique's six destinations. */
export const CONSENT_MEANINGS: Record<ConsentDecision, string> = {
  unknown:
    "Five destinations wait for your answer. Your own API always receives events.",
  granted:
    "All six destinations receive events, and every SDK with a switch of its own collects.",
  denied:
    "Only your own API receives events, and every SDK with a switch of its own stops collecting.",
};

/** Where an SDK's own collection switch stands, or that it has none and Trace holds its events instead. */
export const COLLECTION_LABELS: Record<CollectionState, string> = {
  collecting: "Collecting",
  off: "Off",
  none: "None of its own: Trace holds its events",
};

export const REQUEST_LABELS: Record<NetworkRequest["outcome"], string> = {
  accepted: "202",
  failed: "503",
  aborted: "Aborted",
};
