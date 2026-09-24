import type { FlushResult } from "src/types/FlushResult";
import { TraceError } from "src/utils/TraceError";

const getInvalidResult = (): FlushResult =>
  Object.freeze({
    status: "failed",
    error: new TraceError({
      code: "INVALID_ANSWER",
      message:
        "The adapter answered flush with a result its contract does not allow.",
    }),
  });

const getFlushResult = (answer: unknown): FlushResult => {
  // A JavaScript adapter can answer anything.
  if (typeof answer !== "object" || answer === null) {
    return getInvalidResult();
  }

  const fields: { status?: unknown; error?: unknown } = answer;
  const { status } = fields;

  if (status === "flushed" || status === "timeout") {
    return Object.freeze({ status });
  }

  if (status === "failed") {
    return Object.freeze({ status, error: fields.error });
  }

  return getInvalidResult();
};

export const copyFlushResult = (answer: unknown): FlushResult => {
  try {
    return getFlushResult(answer);
  } catch (error) {
    return Object.freeze({ status: "failed", error });
  }
};
