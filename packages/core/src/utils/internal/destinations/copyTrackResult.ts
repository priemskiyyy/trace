import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { MappingLoss } from "src/types/MappingLoss";
import type { TrackEvidence } from "src/types/TrackEvidence";
import type { TrackResult } from "src/types/TrackResult";
import { TraceError } from "src/utils/TraceError";

type SkipReason = Extract<TrackResult, { status: "skipped" }>["reason"];

type AnswerFields = {
  status?: unknown;
  evidence?: unknown;
  event?: unknown;
  losses?: unknown;
  reason?: unknown;
  error?: unknown;
};

const TRACK_EVIDENCE = Object.freeze({
  "sdk-call-returned": true,
  "sdk-callback-completed": true,
  "backend-acknowledged": true,
} satisfies Record<TrackEvidence, true>);

const SKIP_REASONS = Object.freeze({
  "auth-subject-mismatch": true,
  unidentified: true,
  unsupported: true,
} satisfies Record<SkipReason, true>);

const LOSS_REASONS = Object.freeze({
  redacted: true,
  truncated: true,
  invalid: true,
  unsupported: true,
  omitted: true,
  coerced: true,
} satisfies Record<MappingLoss["reason"], true>);

const isTrackEvidence = (value: unknown): value is TrackEvidence =>
  typeof value === "string" && Object.hasOwn(TRACK_EVIDENCE, value);

const isSkipReason = (value: unknown): value is SkipReason =>
  typeof value === "string" && Object.hasOwn(SKIP_REASONS, value);

const isLossReason = (value: unknown): value is MappingLoss["reason"] =>
  typeof value === "string" && Object.hasOwn(LOSS_REASONS, value);

const createInvalidAnswer = () =>
  new TraceError({
    code: "INVALID_ANSWER",
    message:
      "The adapter answered track with a result its contract does not allow.",
  });

const copyLoss = (value: unknown): MappingLoss => {
  if (typeof value !== "object" || value === null) {
    throw createInvalidAnswer();
  }

  const { path, reason }: { path?: unknown; reason?: unknown } = value;

  if (typeof path !== "string" || !isLossReason(reason)) {
    throw createInvalidAnswer();
  }

  return Object.freeze({ path, reason });
};

const getLosses = (eventLosses: MappingLoss[], adapterLosses: unknown) => {
  if (adapterLosses !== undefined && !Array.isArray(adapterLosses)) {
    throw createInvalidAnswer();
  }

  const reported: unknown[] = adapterLosses ?? [];
  const losses = [...eventLosses, ...reported].map(copyLoss);

  Object.freeze(losses);

  return losses;
};

const copyEventReference = (value: unknown) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "object") {
    throw createInvalidAnswer();
  }

  const { id }: { id?: unknown } = value;

  if (typeof id !== "string") {
    throw createInvalidAnswer();
  }

  return Object.freeze({ id });
};

const getTrackOutcome = (
  answer: unknown,
  eventLosses: MappingLoss[],
): DestinationOutcome => {
  // A JavaScript adapter can answer anything.
  if (typeof answer !== "object" || answer === null) {
    throw createInvalidAnswer();
  }

  const fields: AnswerFields = answer;
  const { status } = fields;

  if (status === "submitted") {
    const { evidence } = fields;

    if (!isTrackEvidence(evidence)) {
      throw createInvalidAnswer();
    }

    return Object.freeze({
      status,
      evidence,
      event: copyEventReference(fields.event),
      losses: getLosses(eventLosses, fields.losses),
    });
  }

  if (status === "dropped") {
    if (fields.reason !== "provider-filtered") {
      throw createInvalidAnswer();
    }

    return Object.freeze({
      status,
      reason: "provider-filtered",
      losses: getLosses(eventLosses, fields.losses),
    });
  }

  if (status === "skipped") {
    const { reason } = fields;

    if (!isSkipReason(reason)) {
      throw createInvalidAnswer();
    }

    return Object.freeze({ status, reason });
  }

  if (status === "failed") {
    return Object.freeze({ status, error: fields.error });
  }

  if (status === "indeterminate") {
    if (fields.reason !== "ambiguous") {
      throw createInvalidAnswer();
    }

    return Object.freeze({ status, reason: "ambiguous" });
  }

  throw createInvalidAnswer();
};

export const copyTrackResult = (
  answer: unknown,
  eventLosses: MappingLoss[],
): DestinationOutcome => {
  try {
    return getTrackOutcome(answer, eventLosses);
  } catch (error) {
    return Object.freeze({ status: "failed", error });
  }
};
