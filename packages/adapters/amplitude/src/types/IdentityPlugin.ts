import type { AmplitudeEventOptions } from "src/types/AmplitudeEventOptions";

/**
 * Amplitude's enrichment plugin that files each call Trace makes under the
 * user and device it was made for. Create it with `identityPlugin()`, add it
 * to the SDK once `init` has finished, and pass it to `amplitude(...)`.
 *
 * @example
 * ```ts
 * const plugin: IdentityPlugin = identityPlugin();
 *
 * Amplitude.add(plugin);
 * ```
 */
export type IdentityPlugin = {
  /** Its name in Amplitude's pipeline, where Amplitude keeps one plugin per name. */
  name: string;
  /** Amplitude runs enrichment plugins after its own context plugin has filled in the user and device. */
  type: "enrichment";
  /** Called by Amplitude when it adds the plugin. */
  setup: () => Promise<void>;
  /** Called by Amplitude when it takes the plugin out, on `remove()` and on every later `init()`; Trace sends nothing until it is added again. */
  teardown: () => Promise<void>;
  /** Called by Amplitude for every event; only a call carrying Trace's user and device in its `extra` is changed. */
  execute: <TEvent extends AmplitudeEventOptions>(
    event: TEvent,
  ) => Promise<TEvent>;
  /** Called by the adapter: whether Amplitude holds the plugin now. */
  isSetUp: () => boolean;
};
