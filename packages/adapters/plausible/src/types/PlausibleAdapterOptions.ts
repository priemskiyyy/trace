import type { PlausibleLike } from "src/types/PlausibleLike";

/**
 * Options for `plausible()`. The application initializes Plausible and owns
 * it; Trace only calls it.
 *
 * @example
 * ```ts
 * plausible({ sdk: { track } });
 * ```
 */
export type PlausibleAdapterOptions<TSdk extends PlausibleLike> = {
  /** The tracker the application initialized: an object holding its `track`, or the module itself. */
  sdk: TSdk;
};
