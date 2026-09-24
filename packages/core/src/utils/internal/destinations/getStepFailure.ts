import type { IdentityStep } from "src/types/internal/IdentityStep";
import type { StepAnswer } from "src/types/internal/StepAnswer";
import { assertUnreachable } from "src/utils/common/assertUnreachable";
import { TraceError } from "src/utils/TraceError";

const isUnsupported = (error: unknown) => {
  // A proxy's traps run inside instanceof and property reads, and may throw.
  try {
    return error instanceof TraceError && error.code === "UNSUPPORTED";
  } catch {
    return false;
  }
};

export const getStepFailure = (step: IdentityStep, answer: StepAnswer) => {
  if (answer.kind === "RESULT") {
    return null;
  }

  if (answer.kind === "TIMEOUT") {
    return "timeout";
  }

  if (answer.kind === "THREW") {
    if (!isUnsupported(answer.error)) {
      return "error";
    }

    return step.kind === "reset" ? "unsupported" : null;
  }

  return assertUnreachable(answer);
};
