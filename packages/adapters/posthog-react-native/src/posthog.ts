import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { PostHogAdapterOptions } from "src/types/PostHogAdapterOptions";
import type { PostHogLike } from "src/types/PostHogLike";
import { applyCollection } from "src/utils/applyCollection";
import { applyGroup } from "src/utils/applyGroup";
import { applyIdentify } from "src/utils/applyIdentify";
import { IDENTITY_EVENTS } from "src/utils/constants/events";
import { getPostHogProperties } from "src/utils/getPostHogProperties";

/**
 * Sends each event to PostHog as one `capture` with its timestamp and its id
 * as `uuid`, through the posthog-react-native client the application created,
 * once the client has loaded its storage. Identity goes through PostHog's own
 * calls, and Trace never creates or shuts the client down.
 *
 * @example
 * ```ts
 * import PostHog from "posthog-react-native";
 *
 * const client = new PostHog("phc_project_api_key", { defaultOptIn: false });
 *
 * const trace = new Trace({
 *   events,
 *   destinations: { research: posthog({ sdk: client }) },
 *   consent: { research: ["analytics"] },
 * });
 * ```
 */
export const posthog = <TSdk extends PostHogLike>({
  sdk,
}: PostHogAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "posthog-react-native",
  open: () => {
    if (sdk.isDisabled) {
      throw new TraceError({
        code: "UNSUPPORTED",
        message:
          "PostHog is disabled, by disabled: true or a missing API key, so it would send and flush nothing.",
      });
    }

    let collection: boolean | null = null;

    // posthog-react-native loads its storage after it is created, so every call waits for it, in the order Trace makes them.
    return {
      native: sdk,
      track: async (event, { signal }) => {
        if (IDENTITY_EVENTS.includes(event.name)) {
          return { status: "skipped", reason: "unsupported" };
        }

        const { properties, losses } = getPostHogProperties(event);

        await sdk.ready();

        // Trace gave up on the event while the client loaded, at its timeout or on disposal.
        if (signal.aborted) {
          return { status: "indeterminate", reason: "ambiguous" };
        }

        sdk.capture(event.name, properties, {
          timestamp: new Date(event.timestamp),
          uuid: event.id,
        });

        return { status: "submitted", evidence: "sdk-call-returned", losses };
      },
      identify: async ({ user }) => {
        await sdk.ready();
        applyIdentify(sdk, user);
      },
      traits: async ({ set, remove }) => {
        await sdk.ready();
        sdk.unsetPersonProperties(remove);
        sdk.setPersonProperties(set);
      },
      group: async (update) => {
        await sdk.ready();
        await applyGroup(sdk, update);
      },
      reset: async () => {
        await sdk.ready();
        sdk.reset();

        // posthog-react-native's reset returns consent to its configured default.
        if (collection !== null) {
          await applyCollection(sdk, collection);
        }
      },
      collection: async (enabled) => {
        collection = enabled;
        await sdk.ready();
        await applyCollection(sdk, enabled);
      },
      flush: async () => {
        await sdk.ready();
        await sdk.flush();

        return { status: "flushed" };
      },
    };
  },
});
