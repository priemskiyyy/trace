import type { DestinationOutcome } from "@priemskiyyy/trace";

import type { OutcomeStatus } from "src/types/OutcomeStatus";

export const getOutcomeStatus = (
  outcome: DestinationOutcome | null | undefined,
): OutcomeStatus => {
  if (outcome === undefined) {
    return "not-routed";
  }

  if (outcome === null) {
    return "pending";
  }

  return outcome.status;
};
