/**
 * The part of `fathom-client` the adapter calls. The module satisfies it, and
 * so does an object holding its `trackEvent`.
 *
 * @example
 * ```ts
 * import * as Fathom from "fathom-client";
 *
 * Fathom.load("YOUR_SITE_ID");
 * const sdk: FathomLike = Fathom;
 * ```
 */
export type FathomLike = {
  /** Queues the event until Fathom's script has loaded, answers nothing either way, and takes `_value` in cents. */
  trackEvent: (name: string, options?: { _value: number }) => void;
};
