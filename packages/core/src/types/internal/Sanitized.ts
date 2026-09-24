import type { MappingLoss } from "src/types/MappingLoss";

export type Sanitized = {
  value: Record<string, unknown>;
  losses: MappingLoss[];
};
