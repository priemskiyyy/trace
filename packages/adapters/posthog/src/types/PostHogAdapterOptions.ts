import type { PostHogLike } from "src/types/PostHogLike";

/**
 * Options for `posthog()`: the posthog-js instance the application
 * initialized.
 *
 * @example
 * ```ts
 * import posthogJs from "posthog-js";
 *
 * posthog({ sdk: posthogJs });
 * ```
 */
export type PostHogAdapterOptions<TSdk extends PostHogLike> = {
  /** The posthog-js instance the application initialized, opted out while consent is pending. */
  sdk: TSdk;
};
