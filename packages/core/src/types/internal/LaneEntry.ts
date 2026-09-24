import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { IdentityTarget } from "src/types/internal/IdentityTarget";
import type { MappingLoss } from "src/types/MappingLoss";
import type { TrackedEvent } from "src/types/TrackedEvent";

export type LaneEntry = {
  event: TrackedEvent;
  identity: IdentityTarget;
  losses: MappingLoss[];
  land: (outcome: DestinationOutcome) => void;
};
