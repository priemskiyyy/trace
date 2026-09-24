import type { MixpanelLike } from "src/types/MixpanelLike";

/**
 * Options for `mixpanel()`: the mixpanel Node client the application created,
 * and the visitor id of the request.
 *
 * @example
 * ```ts
 * mixpanel({ sdk: client, anonymousId: "visitor_7" });
 * ```
 */
export type MixpanelAdapterOptions<TSdk extends MixpanelLike> = {
  /** The client `Mixpanel.init` returned. It is also `native`. */
  sdk: TSdk;
  /** The visitor id the application keeps for signed-out traffic, such as a cookie. Every event carries it as `$device_id`, beside the user's `$user_id` once there is one. */
  anonymousId?: string;
};
