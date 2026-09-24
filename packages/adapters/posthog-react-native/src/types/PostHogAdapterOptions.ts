import type { PostHogLike } from "src/types/PostHogLike";

/**
 * Options for `posthog()`: the posthog-react-native client the application
 * created.
 *
 * @example
 * ```ts
 * import PostHog from "posthog-react-native";
 *
 * posthog({ sdk: new PostHog("phc_project_api_key", { defaultOptIn: false }) });
 * ```
 */
export type PostHogAdapterOptions<TSdk extends PostHogLike> = {
  /** The posthog-react-native client the application created, opted out while consent is pending. */
  sdk: TSdk;
};
