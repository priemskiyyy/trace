import type { BoutiqueTrace } from "example-shared/boutique/reporting/types/BoutiqueTrace";
import { CREWS } from "example-shared/boutique/users/constants/crews";
import type { CrewId } from "example-shared/boutique/users/types/CrewId";

/** Joining, switching or leaving a crew is one group call; Trace carries it to every destination that has groups. */
export const switchCrew = (trace: BoutiqueTrace, crewId: CrewId | null) => {
  if (crewId === null) {
    trace.group("crew", null);

    return;
  }

  trace.group("crew", { id: crewId, traits: { size: CREWS[crewId].size } });
};
