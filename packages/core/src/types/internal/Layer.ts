import type { MappingLoss } from "src/types/MappingLoss";

export type Layer = Map<string, { value: unknown; losses: MappingLoss[] }>;
