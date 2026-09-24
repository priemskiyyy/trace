import type { IdentityPlugin } from "src/types/IdentityPlugin";

/**
 * Creates the Amplitude plugin that files each call Trace makes under the user
 * and device it was made for, which Amplitude would otherwise fill in when it
 * processes the call. Add it to the SDK once `init` has finished, and pass
 * the same plugin to `amplitude(...)`.
 *
 * @example
 * ```ts
 * import * as Amplitude from "@amplitude/analytics-browser";
 *
 * await Amplitude.init("amplitude_api_key").promise;
 *
 * const plugin = identityPlugin();
 *
 * Amplitude.add(plugin);
 * ```
 */
export const identityPlugin = (): IdentityPlugin => {
  let isSetUp = false;

  return {
    name: "@priemskiyyy/trace-amplitude",
    type: "enrichment",
    setup: () => {
      isSetUp = true;

      return Promise.resolve();
    },
    teardown: () => {
      isSetUp = false;

      return Promise.resolve();
    },
    execute: (event) => {
      const pinned = event.extra?.["@priemskiyyy/trace-amplitude"];

      if (pinned === undefined) {
        return Promise.resolve(event);
      }

      delete event.user_id;

      return Promise.resolve(Object.assign(event, pinned));
    },
    isSetUp: () => isSetUp,
  };
};
