import type { DestinationFlushResult } from "src/types/DestinationFlushResult";
import type { Answer } from "src/types/internal/Answer";
import { assertUnreachable } from "src/utils/common/assertUnreachable";
import { copyFlushResult } from "src/utils/internal/destinations/copyFlushResult";

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
