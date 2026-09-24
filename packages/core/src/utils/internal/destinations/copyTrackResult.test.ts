import { expect, test } from "vitest";

import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { MappingLoss } from "src/types/MappingLoss";
import { copyTrackResult } from "src/utils/internal/destinations/copyTrackResult";
import { TraceError } from "src/utils/TraceError";

const redacted: MappingLoss = {
  path: "properties.card.cvc",
  reason: "redacted",
};

const timestamp: MappingLoss = { path: "timestamp", reason: "unsupported" };

const isDeepFrozen = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) {
    return true;
  }

  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
};

const getInvalidAnswer = (outcome: DestinationOutcome) => {
  if (outcome.status !== "failed" || !(outcome.error instanceof TraceError)) {
    return null;
  }

  return { code: outcome.error.code, message: outcome.error.message };
};

const invalidAnswer = {
  code: "INVALID_ANSWER",
  message:
    "The adapter answered track with a result its contract does not allow.",
};

test("a submitted answer without an event or losses publishes null and no losses of its own", () => {
  const published = {
    status: "submitted",
    evidence: "sdk-call-returned",
    event: null,
    losses: [],
  };

  expect(
    copyTrackResult({ status: "submitted", evidence: "sdk-call-returned" }, []),
  ).toEqual(published);
  expect(
    copyTrackResult(
      { status: "submitted", evidence: "sdk-call-returned", event: null },
      [],
    ),
  ).toEqual(published);
});

test("losses are combined once, the event's first and then the adapter's", () => {
  expect(
    copyTrackResult(
      {
        status: "submitted",
        evidence: "backend-acknowledged",
        event: { id: "provider-event-1" },
        losses: [timestamp],
      },
      [redacted],
    ),
  ).toEqual({
    status: "submitted",
    evidence: "backend-acknowledged",
    event: { id: "provider-event-1" },
    losses: [redacted, timestamp],
  });
  expect(
    copyTrackResult(
      { status: "dropped", reason: "provider-filtered", losses: [timestamp] },
      [redacted],
    ),
  ).toEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [redacted, timestamp],
  });
  expect(
    copyTrackResult({ status: "dropped", reason: "provider-filtered" }, [
      redacted,
    ]),
  ).toEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [redacted],
  });
});

test("the event and the losses are copied, so neither the adapter nor the event can change a published outcome", () => {
  const event = { id: "provider-event-1" };
  const adapterLosses: MappingLoss[] = [{ ...timestamp }];
  const eventLosses: MappingLoss[] = [{ ...redacted }];

  const outcome = copyTrackResult(
    {
      status: "submitted",
      evidence: "sdk-callback-completed",
      event,
      losses: adapterLosses,
    },
    eventLosses,
  );

  event.id = "changed by the provider";
  adapterLosses.push({ path: "context", reason: "omitted" });
  eventLosses.push({ path: "context.app", reason: "truncated" });

  expect(outcome).toEqual({
    status: "submitted",
    evidence: "sdk-callback-completed",
    event: { id: "provider-event-1" },
    losses: [redacted, timestamp],
  });
});

test("a published outcome is frozen through and through", () => {
  const outcomes = [
    copyTrackResult(
      {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: { id: "provider-event-1" },
        losses: [{ ...timestamp }],
      },
      [{ ...redacted }],
    ),
    copyTrackResult({ status: "dropped", reason: "provider-filtered" }, [
      { ...redacted },
    ]),
    copyTrackResult({ status: "skipped", reason: "unidentified" }, []),
    copyTrackResult({ status: "indeterminate", reason: "ambiguous" }, []),
  ];

  const failed = copyTrackResult(
    { status: "failed", error: new Error("network down") },
    [],
  );

  expect(outcomes.every(isDeepFrozen)).toBe(true);
  expect(Object.isFrozen(failed)).toBe(true);
});

test("every other answer the contract allows is published as a copy of itself", () => {
  const failure = new Error("network down");

  const answers = [
    { status: "skipped", reason: "auth-subject-mismatch" },
    { status: "skipped", reason: "unidentified" },
    { status: "skipped", reason: "unsupported" },
    { status: "failed", error: failure },
    { status: "indeterminate", reason: "ambiguous" },
  ];

  for (const answer of answers) {
    const outcome = copyTrackResult(answer, [redacted]);

    expect(outcome).toEqual(answer);
    expect(outcome).not.toBe(answer);
  }

  const failed = copyTrackResult({ status: "failed", error: failure }, []);

  expect(failed.status === "failed" ? failed.error : null).toBe(failure);
});

test("an answer with a status the contract does not know becomes failed with TraceError INVALID_ANSWER", () => {
  const answers = [
    undefined,
    null,
    "submitted",
    [{ status: "submitted", evidence: "sdk-call-returned" }],
    {},
    { status: "delivered" },
    { status: "handed-off" },
  ];

  for (const answer of answers) {
    expect(getInvalidAnswer(copyTrackResult(answer, []))).toEqual(
      invalidAnswer,
    );
  }
});

test("an answer that claims a reason only the core may give becomes failed with TraceError INVALID_ANSWER", () => {
  const answers = [
    { status: "dropped", reason: "consent" },
    { status: "dropped", reason: "buffer-overflow" },
    { status: "skipped", reason: "identity-failed" },
    { status: "skipped", reason: "start-failed" },
    { status: "indeterminate", reason: "timeout" },
    { status: "indeterminate", reason: "disposed" },
  ];

  for (const answer of answers) {
    expect(getInvalidAnswer(copyTrackResult(answer, []))).toEqual(
      invalidAnswer,
    );
  }
});

test("a submitted answer whose evidence, event or losses break the contract becomes failed with TraceError INVALID_ANSWER", () => {
  const answers = [
    { status: "submitted" },
    { status: "submitted", evidence: "dashboard-confirmed" },
    { status: "submitted", evidence: "sdk-call-returned", event: "event-1" },
    { status: "submitted", evidence: "sdk-call-returned", event: { id: 7 } },
    { status: "submitted", evidence: "sdk-call-returned", losses: "none" },
    { status: "submitted", evidence: "sdk-call-returned", losses: null },
    { status: "submitted", evidence: "sdk-call-returned", losses: {} },
    {
      status: "submitted",
      evidence: "sdk-call-returned",
      losses: [{ path: 7, reason: "unsupported" }],
    },
    { status: "submitted", evidence: "sdk-call-returned", losses: [null] },
    {
      status: "submitted",
      evidence: "sdk-call-returned",
      losses: [{ path: "properties.cart", reason: "invented" }],
    },
    { status: "dropped", reason: "provider-filtered", losses: ["timestamp"] },
  ];

  for (const answer of answers) {
    expect(getInvalidAnswer(copyTrackResult(answer, []))).toEqual(
      invalidAnswer,
    );
  }
});

test("an answer whose fields throw when read is a failed outcome with that error, never a throw", () => {
  const failure = new Error("getter exploded");

  const answer = {
    get status() {
      throw failure;
    },
  };

  expect(copyTrackResult(answer, [])).toEqual({
    status: "failed",
    error: failure,
  });
});
