import type { TraceLimits } from "src/types/TraceLimits";

/** The bounds a Trace applies to its data unless `privacy.limits` changes them. */
export const DEFAULT_LIMITS: TraceLimits = Object.freeze({
  depth: 6,
  breadth: 50,
  stringLength: 2_000,
  totalSize: 200_000,
});
