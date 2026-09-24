import type { TrackedEvent } from "@priemskiyyy/trace";

import type { FathomLike } from "src/types/FathomLike";

/**
 * Options for `fathom()`. The application loads Fathom and owns it; Trace only
 * calls it.
 *
 * @example
 * ```ts
 * fathom({
 *   sdk: Fathom,
 *   value: ({ name, properties }) =>
 *     name === "Order Completed" && typeof properties.total === "number" ? Math.round(properties.total * 100) : null,
 * });
 * ```
 */
export type FathomAdapterOptions<TSdk extends FathomLike> = {
  /** `fathom-client`, or an object holding its `trackEvent`. */
  sdk: TSdk;
  /** The event's value in whole cents, or `null` for an event without one; any other number is left out. Omitted, no event carries a value. */
  value?: (event: TrackedEvent) => number | null;
};
