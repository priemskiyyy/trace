import type { DestinationFlushResult } from "src/types/DestinationFlushResult";
import type { FlushResult } from "src/types/FlushResult";
import type { Answer } from "src/types/internal/Answer";
import { assertUnreachable } from "src/utils/common/assertUnreachable";
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

const copyFlushResult = (answer: unknown): FlushResult => {
  // A JavaScript adapter can answer anything, and its fields can throw when read.
  try {
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
  } catch (error) {
    return Object.freeze({ status: "failed", error });
  }
};

export const getFlushResult = (
  answer: Answer,
): DestinationFlushResult | Promise<DestinationFlushResult> => {
  if (answer.kind === "THREW") {
    return Object.freeze({ status: "failed", error: answer.error });
  }

  if (answer.kind === "PENDING") {
    return answer.promise.then(
      copyFlushResult,
      (error: unknown): DestinationFlushResult =>
        Object.freeze({ status: "failed", error }),
    );
  }

  if (answer.kind === "RESULT") {
    return copyFlushResult(answer.value);
  }

  return assertUnreachable(answer);
};
