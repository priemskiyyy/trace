/**
 * The part of `@plausible-analytics/tracker` the adapter calls: its `track`,
 * once the application has called `init`. The module satisfies it, and so
 * does an object holding its `track`.
 *
 * @example
 * ```ts
 * import { init, track } from "@plausible-analytics/tracker";
 *
 * init({ domain: "example.com" });
 * plausible({ sdk: { track } });
 * ```
 */
export type PlausibleLike = {
  /**
   * Throws before `init`. Answers through `callback`: the response's status
   * once the request completed, the error when it failed, and nothing when
   * Plausible ignored the event.
   */
  track: (
    name: string,
    options: {
      props: Record<string, string>;
      callback: (result?: { status: number } | { error: unknown }) => void;
    },
  ) => void;
};
