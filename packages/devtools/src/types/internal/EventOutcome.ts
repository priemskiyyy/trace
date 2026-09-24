import type { DestinationOutcome } from "@priemskiyyy/trace";

import type { ContextLoss } from "src/types/internal/ContextLoss";

export type EventOutcome = {
  destination: string;
  status: DestinationOutcome["status"] | "pending";
  summary: string;
  losses: ContextLoss[];
};
