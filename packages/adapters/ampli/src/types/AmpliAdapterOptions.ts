import type { AmpliLike } from "src/types/AmpliLike";
import type { AmplitudeIdentifyLike } from "src/types/AmplitudeIdentifyLike";
import type { IdentityPlugin } from "src/types/IdentityPlugin";

/**
 * Options for `ampli()`: the generated wrapper the application loaded, the
 * `Identify` class from its Amplitude SDK, and the plugin the application
 * added to `ampli.client`.
 *
 * @example
 * ```ts
 * const plugin = identityPlugin();
 *
 * Ampli.ampli.client.add(plugin);
 * ampli({ sdk: Ampli.ampli, Identify: amplitude.Identify, plugin });
 * ```
 */
export type AmpliAdapterOptions<TSdk extends AmpliLike> = {
  /** The generated `ampli` object, loaded by the application. */
  sdk: TSdk;
  /** Amplitude's `Identify` class, from `@amplitude/analytics-browser`. */
  Identify: new () => AmplitudeIdentifyLike;
  /** The plugin from `identityPlugin()`, which the application added to `ampli.client`. */
  plugin: IdentityPlugin;
};
