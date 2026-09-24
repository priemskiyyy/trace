import type { MappingLoss } from "@priemskiyyy/trace";

/** Fathom stamps an event when its request arrives; its script takes no event time. */
export const TIMESTAMP_LOSS: MappingLoss = Object.freeze({
  path: "timestamp",
  reason: "unsupported",
});

/** Fathom takes an event's value as a whole number of cents, so any other value is left out. */
export const VALUE_LOSS: MappingLoss = Object.freeze({
  path: "value",
  reason: "invalid",
});
