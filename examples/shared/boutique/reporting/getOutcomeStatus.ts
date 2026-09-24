import type { DestinationOutcome } from "@priemskiyyy/trace";
import { match, P } from "ts-pattern";

import type { OutcomeStatus } from "example-shared/boutique/reporting/types/OutcomeStatus";

/** One destination's answer as a status: `undefined` was never routed there, `null` is still out. */
export const getOutcomeStatus = (
  outcome: DestinationOutcome | null | undefined,
): OutcomeStatus =>
  match(outcome)
    .with(undefined, (): OutcomeStatus => "not-routed")
    .with(null, (): OutcomeStatus => "pending")
    .with(P.nonNullable, ({ status }): OutcomeStatus => status)
    .exhaustive();
