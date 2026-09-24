import type { AmplitudeIdentifyLike } from "src/types/AmplitudeIdentifyLike";
import type { AmplitudeLike } from "src/types/AmplitudeLike";
import type { IdentityPlugin } from "src/types/IdentityPlugin";

/**
 * Options for `amplitude()`: the SDK the application initialized, the
 * `Identify` class from the same SDK, and the plugin the application added to
 * it.
 *
 * @example
 * ```ts
 * import * as Amplitude from "@amplitude/analytics-browser";
 *
 * const plugin = identityPlugin();
 *
 * Amplitude.add(plugin);
 * amplitude({ sdk: Amplitude, Identify: Amplitude.Identify, plugin });
 * ```
 */
export type AmplitudeAdapterOptions<TSdk extends AmplitudeLike> = {
  /** The browser or React Native SDK the application initialized. */
  sdk: TSdk;
  /** Amplitude's `Identify` class, constructed for every change of user or group properties. */
  Identify: new () => AmplitudeIdentifyLike;
  /** The plugin from `identityPlugin()`, which the application added to the same SDK. */
  plugin: IdentityPlugin;
};
