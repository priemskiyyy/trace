import type { UmamiLike } from "src/types/UmamiLike";

/**
 * Options for `umami()`. The application loads the Umami tracker and owns it;
 * Trace only calls it.
 *
 * @example
 * ```ts
 * umami({ sdk: window.umami });
 * ```
 */
export type UmamiAdapterOptions<TSdk extends UmamiLike> = {
  /** `window.umami` once the tracker script has run. */
  sdk: TSdk;
};
