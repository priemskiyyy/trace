import type { MappingLoss } from "@priemskiyyy/trace";

/** Vercel stamps an event when it is sent; its browser `track` takes no event time. */
export const TIMESTAMP_LOSS: MappingLoss = Object.freeze({
  path: "timestamp",
  reason: "unsupported",
});
