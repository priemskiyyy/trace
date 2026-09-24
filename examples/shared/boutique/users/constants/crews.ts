import type { Crew } from "example-shared/boutique/users/types/Crew";
import type { CrewId } from "example-shared/boutique/users/types/CrewId";

/** The two shopping crews a shopper can join, switch between or leave. */
export const CREWS: Record<CrewId, Crew> = {
  "night-market": { id: "night-market", name: "Night Market Crew", size: 4 },
  boardwalk: { id: "boardwalk", name: "Boardwalk Regulars", size: 9 },
};

export const CREW_IDS: CrewId[] = ["night-market", "boardwalk"];
