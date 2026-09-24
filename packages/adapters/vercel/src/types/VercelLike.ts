/**
 * The part of `@vercel/analytics` the adapter calls: its browser `track`,
 * once the application has injected the script. The module satisfies it, and
 * so does an object holding its `track`.
 *
 * @example
 * ```ts
 * import { inject, track } from "@vercel/analytics";
 *
 * inject();
 * const sdk: VercelLike = { track };
 * ```
 */
export type VercelLike = {
  /** Throws outside a browser in development and test, and does nothing until `inject` has run. */
  track: (
    name: string,
    properties: Record<string, string | number | boolean | null>,
  ) => void;
};
