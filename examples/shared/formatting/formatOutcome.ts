import type { DestinationOutcome, TrackEvidence } from "@priemskiyyy/trace";
import { match } from "ts-pattern";

import { formatError } from "example-shared/formatting/formatError";

type Reason<TStatus extends "dropped" | "skipped" | "indeterminate"> = Extract<
  DestinationOutcome,
  { status: TStatus }
>["reason"];

const EVIDENCE: Record<TrackEvidence, string> = {
  "sdk-call-returned": "the SDK call returned",
  "sdk-callback-completed": "the SDK's own callback completed",
  "backend-acknowledged": "your backend acknowledged it",
};

const DROPPED: Record<Reason<"dropped">, string> = {
  "provider-filtered": "Dropped: the provider's own filters refused it.",
  consent: "Dropped: consent for this destination was not granted.",
  "buffer-overflow":
    "Dropped: newer events pushed it out of the startup buffer.",
  "buffer-expired": "Dropped: it waited too long for the destination to start.",
  "identity-changed":
    "Dropped: the account changed before this destination could send it.",
  disposed: "Dropped: the demo restarted before it was sent.",
};

const SKIPPED: Record<Reason<"skipped">, string> = {
  "start-failed": "Skipped: this destination never started.",
  "identity-failed":
    "Skipped: the provider refused this user, so its events wait for the next one.",
  "auth-subject-mismatch":
    "Skipped: the account changed while this destination was still working.",
  unidentified: "Skipped: this destination needs a signed-in user.",
  unsupported: "Skipped: the provider has no way to carry this.",
};

const UNCONFIRMED: Record<Reason<"indeterminate">, string> = {
  timeout: "Unconfirmed: no answer within the timeout. It may still arrive.",
  disposed: "Unconfirmed: the demo restarted while it was being sent.",
  ambiguous:
    "Unconfirmed: the provider answered after this event had already settled.",
};

/**
 * One destination's outcome in plain words. `submitted` names only the
 * evidence Trace has, never that the provider stored or delivered the event.
 */
export const formatOutcome = (outcome: DestinationOutcome | null | undefined) =>
  match(outcome)
    .with(
      undefined,
      () => "Not routed: this destination was not one of the event's targets.",
    )
    .with(null, () => "Pending: waiting for its answer.")
    .with({ status: "submitted" }, ({ evidence, event }) =>
      event === null
        ? `Submitted: ${EVIDENCE[evidence]}. That is as far as Trace can see.`
        : `Submitted as ${event.id}: ${EVIDENCE[evidence]}. That is as far as Trace can see.`,
    )
    .with({ status: "dropped" }, ({ reason }) => DROPPED[reason])
    .with({ status: "skipped" }, ({ reason }) => SKIPPED[reason])
    .with({ status: "failed" }, ({ error }) => `Failed: ${formatError(error)}`)
    .with({ status: "indeterminate" }, ({ reason }) => UNCONFIRMED[reason])
    .exhaustive();
