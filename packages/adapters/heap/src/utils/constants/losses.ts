import type { MappingLoss } from "@priemskiyyy/trace";

/** heap.js stamps an event when it takes the call; its browser API takes no event time. */
export const TIMESTAMP_LOSS: MappingLoss = Object.freeze({
  path: "timestamp",
  reason: "unsupported",
});
