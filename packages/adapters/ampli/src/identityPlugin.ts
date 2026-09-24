import type { IdentityPlugin } from "src/types/IdentityPlugin";

/**
 * Creates the Amplitude plugin that files each call Trace makes under the user
 * and device the call carries in its `extra`, which Amplitude would otherwise
 * fill in when it processes the call. Add it to `ampli.client` once
 * `ampli.load()` has finished, and pass the same plugin to `ampli(...)`.
 *
 * @example
 * ```ts
 * await Ampli.ampli.load({ environment: "production" }).promise;
 *
 * const plugin = identityPlugin();
 *
 * Ampli.ampli.client.add(plugin);
 * ```
 */
export const identityPlugin = (): IdentityPlugin => {
  let isSetUp = false;

  return {
    name: "@priemskiyyy/trace-ampli",
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
      const pinned = event.extra?.["@priemskiyyy/trace-ampli"];

      if (pinned === undefined) {
        return Promise.resolve(event);
      }

      delete event.user_id;

      return Promise.resolve(Object.assign(event, pinned));
    },
    isSetUp: () => isSetUp,
  };
};
