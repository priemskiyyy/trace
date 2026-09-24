import type { MappingLoss } from "@priemskiyyy/trace";

/** A lost value in plain words: where it sat, and why it could not be carried whole. */
export const formatLoss = ({ path, reason }: MappingLoss) =>
  `${path}: ${reason}`;
