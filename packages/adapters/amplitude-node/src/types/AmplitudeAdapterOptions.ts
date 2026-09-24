import type { AmplitudeIdentifyLike } from "src/types/AmplitudeIdentifyLike";
import type { AmplitudeLike } from "src/types/AmplitudeLike";

/**
 * Options for `amplitude()`: the Amplitude Node SDK the application
 * initialized, the `Identify` class from the same SDK, and the visitor id of
 * the request.
 *
 * @example
 * ```ts
 * import * as Amplitude from "@amplitude/analytics-node";
 *
 * amplitude({ sdk: Amplitude, Identify: Amplitude.Identify, anonymousId: "visitor_7" });
 * ```
 */
export type AmplitudeAdapterOptions<TSdk extends AmplitudeLike> = {
  /** The Node SDK the application initialized: the module namespace or an instance from `createInstance()`. It is also `native`. */
  sdk: TSdk;
  /** Amplitude's `Identify` class, constructed for every change of user or group properties. */
  Identify: new () => AmplitudeIdentifyLike;
  /** The visitor id the application keeps for signed-out traffic, such as a cookie. Every call carries it as `device_id`, beside the user's `user_id` once there is one. */
  anonymousId?: string;
};
