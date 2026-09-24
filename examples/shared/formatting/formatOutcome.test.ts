import type { DestinationOutcome } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { formatOutcome } from "example-shared/formatting/formatOutcome";

test("submitted names its evidence and the provider's reference, and never claims delivery", () => {
  const withEvent: DestinationOutcome = {
    status: "submitted",
    evidence: "sdk-call-returned",
    event: { id: "evt_1" },
    losses: [],
  };

  const withoutEvent: DestinationOutcome = {
    status: "submitted",
    evidence: "sdk-callback-completed",
    event: null,
    losses: [],
  };

  const backendAcknowledged: DestinationOutcome = {
    status: "submitted",
    evidence: "backend-acknowledged",
    event: { id: "evt_2" },
    losses: [],
  };

  expect(formatOutcome(withEvent)).toBe(
    "Submitted as evt_1: the SDK call returned. That is as far as Trace can see.",
  );
  expect(formatOutcome(withoutEvent)).toBe(
    "Submitted: the SDK's own callback completed. That is as far as Trace can see.",
  );
  expect(formatOutcome(backendAcknowledged)).toBe(
    "Submitted as evt_2: your backend acknowledged it. That is as far as Trace can see.",
  );

  for (const outcome of [withEvent, withoutEvent, backendAcknowledged]) {
    expect(formatOutcome(outcome).toLowerCase()).not.toContain("delivered");
  }
});

test("dropped names why the event never reached the provider", () => {
  const reasons: DestinationOutcome[] = [
    { status: "dropped", reason: "provider-filtered", losses: [] },
    { status: "dropped", reason: "consent" },
    { status: "dropped", reason: "buffer-overflow" },
    { status: "dropped", reason: "buffer-expired" },
    { status: "dropped", reason: "identity-changed" },
    { status: "dropped", reason: "disposed" },
  ];

  expect(reasons.map(formatOutcome)).toEqual([
    "Dropped: the provider's own filters refused it.",
    "Dropped: consent for this destination was not granted.",
    "Dropped: newer events pushed it out of the startup buffer.",
    "Dropped: it waited too long for the destination to start.",
    "Dropped: the account changed before this destination could send it.",
    "Dropped: the demo restarted before it was sent.",
  ]);
});

test("skipped names why the provider was left out", () => {
  const reasons: DestinationOutcome[] = [
    { status: "skipped", reason: "start-failed" },
    { status: "skipped", reason: "identity-failed" },
    { status: "skipped", reason: "auth-subject-mismatch" },
    { status: "skipped", reason: "unidentified" },
    { status: "skipped", reason: "unsupported" },
  ];

  expect(reasons.map(formatOutcome)).toEqual([
    "Skipped: this destination never started.",
    "Skipped: the provider refused this user, so its events wait for the next one.",
    "Skipped: the account changed while this destination was still working.",
    "Skipped: this destination needs a signed-in user.",
    "Skipped: the provider has no way to carry this.",
  ]);
});

test("failed shows the provider's own error", () => {
  const outcome: DestinationOutcome = {
    status: "failed",
    error: new Error("The orders endpoint answered 503."),
  };

  expect(formatOutcome(outcome)).toBe(
    "Failed: Error: The orders endpoint answered 503.",
  );
});

test("indeterminate says the answer never confirmed the outcome", () => {
  const reasons: DestinationOutcome[] = [
    { status: "indeterminate", reason: "timeout" },
    { status: "indeterminate", reason: "disposed" },
    { status: "indeterminate", reason: "ambiguous" },
  ];

  expect(reasons.map(formatOutcome)).toEqual([
    "Unconfirmed: no answer within the timeout. It may still arrive.",
    "Unconfirmed: the demo restarted while it was being sent.",
    "Unconfirmed: the provider answered after this event had already settled.",
  ]);
});

test("an outcome outside the event's targets reads as not routed, and a pending one as waiting", () => {
  expect(formatOutcome(undefined)).toBe(
    "Not routed: this destination was not one of the event's targets.",
  );
  expect(formatOutcome(null)).toBe("Pending: waiting for its answer.");
});
