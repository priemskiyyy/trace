import type { MappingLoss } from "@priemskiyyy/trace";

/** Plausible stamps an event when its request arrives; its Events API has no time field. */
export const TIMESTAMP_LOSS: MappingLoss = Object.freeze({
  path: "timestamp",
  reason: "unsupported",
});
