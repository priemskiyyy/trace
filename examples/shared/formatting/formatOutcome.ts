import type { DestinationOutcome, TrackEvidence } from "@priemskiyyy/trace";

import { formatError } from "example-shared/formatting/formatError";
import { assertUnreachable } from "example-shared/utils/assertUnreachable";

type Outcome<TStatus extends DestinationOutcome["status"]> = Extract<
  DestinationOutcome,
  { status: TStatus }
>;

const formatEvidence = (evidence: TrackEvidence) => {
  if (evidence === "sdk-call-returned") {
    return "the SDK call returned";
  }

  if (evidence === "sdk-callback-completed") {
    return "the SDK's own callback completed";
  }

  if (evidence === "backend-acknowledged") {
    return "your backend acknowledged it";
  }

  return assertUnreachable(evidence);
};

const formatSubmitted = (outcome: Outcome<"submitted">) => {
  const proof = formatEvidence(outcome.evidence);

  if (outcome.event === null) {
    return `Submitted: ${proof}. That is as far as Trace can see.`;
  }

  return `Submitted as ${outcome.event.id}: ${proof}. That is as far as Trace can see.`;
};

const formatDropped = (outcome: Outcome<"dropped">) => {
  if (outcome.reason === "provider-filtered") {
    return "Dropped: the provider's own filters refused it.";
  }

  if (outcome.reason === "consent") {
    return "Dropped: consent for this destination was not granted.";
  }

  if (outcome.reason === "buffer-overflow") {
    return "Dropped: newer events pushed it out of the startup buffer.";
  }

  if (outcome.reason === "buffer-expired") {
    return "Dropped: it waited too long for the destination to start.";
  }

  if (outcome.reason === "identity-changed") {
    return "Dropped: the account changed before this destination could send it.";
  }

  if (outcome.reason === "disposed") {
    return "Dropped: the demo restarted before it was sent.";
  }

  return assertUnreachable(outcome.reason);
};

const formatSkipped = (outcome: Outcome<"skipped">) => {
  if (outcome.reason === "start-failed") {
    return "Skipped: this destination never started.";
  }

  if (outcome.reason === "identity-failed") {
    return "Skipped: the provider refused this user, so its events wait for the next one.";
  }

  if (outcome.reason === "auth-subject-mismatch") {
    return "Skipped: the account changed while this destination was still working.";
  }

  if (outcome.reason === "unidentified") {
    return "Skipped: this destination needs a signed-in user.";
  }

  if (outcome.reason === "unsupported") {
    return "Skipped: the provider has no way to carry this.";
  }

  return assertUnreachable(outcome.reason);
};

const formatIndeterminate = (outcome: Outcome<"indeterminate">) => {
  if (outcome.reason === "timeout") {
    return "Unconfirmed: no answer within the timeout. It may still arrive.";
  }

  if (outcome.reason === "disposed") {
    return "Unconfirmed: the demo restarted while it was being sent.";
  }

  if (outcome.reason === "ambiguous") {
    return "Unconfirmed: the provider answered after this event had already settled.";
  }

  return assertUnreachable(outcome.reason);
};

/**
 * One destination's outcome in plain words. `submitted` names only the
 * evidence Trace has, never that the provider stored or delivered the event.
 */
export const formatOutcome = (
  outcome: DestinationOutcome | null | undefined,
) => {
  if (outcome === undefined) {
    return "Not routed: this destination was not one of the event's targets.";
  }

  if (outcome === null) {
    return "Pending: waiting for its answer.";
  }

  if (outcome.status === "submitted") {
    return formatSubmitted(outcome);
  }

  if (outcome.status === "dropped") {
    return formatDropped(outcome);
  }

  if (outcome.status === "skipped") {
    return formatSkipped(outcome);
  }

  if (outcome.status === "failed") {
    return `Failed: ${formatError(outcome.error)}`;
  }

  if (outcome.status === "indeterminate") {
    return formatIndeterminate(outcome);
  }

  return assertUnreachable(outcome);
};
