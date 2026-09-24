import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { PostHogAdapterOptions } from "src/types/PostHogAdapterOptions";
import type { PostHogLike } from "src/types/PostHogLike";
import { applyCollection } from "src/utils/applyCollection";
import { applyGroup } from "src/utils/applyGroup";
import { applyIdentify } from "src/utils/applyIdentify";
import { applyTraits } from "src/utils/applyTraits";
import { COOKIELESS_MODES } from "src/utils/constants/configuration";
import { IDENTITY_EVENTS } from "src/utils/constants/events";
import { getPostHogProperties } from "src/utils/getPostHogProperties";

/**
 * Sends each event to PostHog as one `capture` with its timestamp and its id
 * as `uuid`, through the posthog-js instance the application initialized.
 * Identity goes through PostHog's own calls, and Trace never initializes or
 * shuts the instance down.
 *
 * @example
 * ```ts
 * import posthogJs from "posthog-js";
 *
 * posthogJs.init("phc_project_api_key", { opt_out_capturing_by_default: true });
 *
 * const trace = new Trace({
 *   events,
 *   destinations: { research: posthog({ sdk: posthogJs }) },
 *   consent: { research: ["analytics"] },
 * });
 * ```
 */
export const posthog = <TSdk extends PostHogLike>({
  sdk,
}: PostHogAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "posthog",
  open: () => {
    if (!sdk.__loaded) {
      throw new TraceError({
        code: "NOT_INITIALIZED",
        message:
          "PostHog is not initialized. Call posthog.init before trace.start().",
      });
    }

    const mode = sdk.config.cookieless_mode;

    if (mode !== undefined && COOKIELESS_MODES.includes(mode)) {
      throw new TraceError({
        code: "UNSUPPORTED",
        message: `PostHog's cookieless_mode "${mode}" ignores opt-out or replaces the person on a consent change, so Trace cannot gate it or keep its identity.`,
      });
    }

    let collection: boolean | null = null;

    return {
      native: sdk,
      track: (event) => {
        if (IDENTITY_EVENTS.includes(event.name)) {
          return { status: "skipped", reason: "unsupported" };
        }

        const { properties, losses } = getPostHogProperties(
          event,
          sdk.config.properties_string_max_length,
        );

        const result = sdk.capture(event.name, properties, {
          timestamp: new Date(event.timestamp),
          uuid: event.id,
        });

        if (result === undefined) {
          return { status: "dropped", reason: "provider-filtered", losses };
        }

        return {
          status: "submitted",
          evidence: "sdk-call-returned",
          event: { id: result.uuid },
          losses,
        };
      },
      identify: ({ user }) => {
        applyIdentify(sdk, user);
      },
      traits: (update) => {
        applyTraits(sdk, update);
      },
      group: (update) => {
        applyGroup(sdk, update);
      },
      reset: () => {
        sdk.reset();

        // PostHog's reset returns consent to the configured default.
        if (collection !== null) {
          applyCollection(sdk, collection);
        }
      },
      collection: (enabled) => {
        collection = enabled;
        applyCollection(sdk, enabled);
      },
    };
  },
});
