import type { PostHogLike } from "src/types/PostHogLike";

/**
 * Options for `posthog()`: the posthog-node client the application
 * constructed, and the visitor id of the request.
 *
 * @example
 * ```ts
 * posthog({ sdk: client, anonymousId: "visitor_7" });
 * ```
 */
export type PostHogAdapterOptions<TSdk extends PostHogLike> = {
  /** The `PostHog` client the application constructed. It is also `native`. */
  sdk: TSdk;
  /** The visitor id the application keeps for signed-out traffic, such as a cookie. A signed-out call goes under it, and a sign-in merges it into the user. */
  anonymousId?: string;
};
