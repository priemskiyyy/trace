import type { MappingLoss } from "@priemskiyyy/trace";

/** The Umami tracker sends no event time; Umami stamps an event when its request arrives. */
export const TIMESTAMP_LOSS: MappingLoss = Object.freeze({
  path: "timestamp",
  reason: "unsupported",
});

/** A user id past Umami's 50 characters, left out of the event because Umami would cut it and could make two users one. */
export const USER_ID_LOSS: MappingLoss = Object.freeze({
  path: "identity.user.id",
  reason: "invalid",
});
