import type { ConsentDecision, DestinationOutcome } from "@priemskiyyy/trace";

import { DESTINATION_GUIDES } from "example-shared/boutique/reporting/constants/destinations";
import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import { formatOutcome } from "example-shared/formatting/formatOutcome";

const HELD_BACK: Record<Exclude<ConsentDecision, "granted">, string> = {
  unknown: "Held back: consent was not answered yet.",
  denied: "Held back: consent was declined.",
};

/** One destination's outcome in words, naming consent when consent is why the event never went there. */
export const explainOutcome = ({
  destination,
  outcome,
  consent,
}: {
  destination: BoutiqueDestination;
  outcome: DestinationOutcome | null | undefined;
  consent: ConsentDecision;
}) => {
  if (
    outcome !== undefined ||
    consent === "granted" ||
    !DESTINATION_GUIDES[destination].consent.gated
  ) {
    return formatOutcome(outcome);
  }

  return HELD_BACK[consent];
};
