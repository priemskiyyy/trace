import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { DiagnosticRecord } from "src/types/internal/DiagnosticRecord";
import { assertUnreachable } from "src/utils/common/assertUnreachable";

export const getOutcomeContext = (
  outcome: DestinationOutcome,
): DiagnosticRecord["context"] => {
  if (outcome.status === "submitted") {
    return { evidence: outcome.evidence, losses: outcome.losses };
  }

  if (outcome.status === "failed") {
    return undefined;
  }

  if (outcome.status === "dropped" && outcome.reason === "provider-filtered") {
    return { reason: outcome.reason, losses: outcome.losses };
  }

  if (
    outcome.status === "dropped" ||
    outcome.status === "skipped" ||
    outcome.status === "indeterminate"
  ) {
    return { reason: outcome.reason };
  }

  return assertUnreachable(outcome);
};
