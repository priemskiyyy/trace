import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { PostHogAdapterOptions } from "src/types/PostHogAdapterOptions";
import type { PostHogLike } from "src/types/PostHogLike";
import { IDENTITY_EVENTS } from "src/utils/constants/events";
import { MAX_DISTINCT_ID_LENGTH } from "src/utils/constants/identity";
import { getDistinctId } from "src/utils/getDistinctId";
import { getPostHogProperties } from "src/utils/getPostHogProperties";

/**
 * Sends each event to PostHog as one `capture` for its user or the visitor's
 * anonymous id, with its memberships, its time and its id as `uuid`, through
 * the posthog-node client the application constructed. Traits and group traits
 * become updates for the same distinct id, and a sign-in merges the visitor
 * into the user.
 *
 * @example
 * ```ts
 * import { PostHog } from "posthog-node";
 *
 * const client = new PostHog("phc_project_api_key");
 *
 * const trace = new Trace({
 *   events,
 *   destinations: { research: posthog({ sdk: client, anonymousId: visitorId }) },
 * });
 * ```
 */
export const posthog = <TSdk extends PostHogLike>({
  sdk,
  anonymousId,
}: PostHogAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "posthog-node",
  open: () => ({
    native: sdk,
    track: (event) => {
      if (IDENTITY_EVENTS.includes(event.name)) {
        return { status: "skipped", reason: "unsupported" };
      }

      const distinctId = getDistinctId(event.identity.user, anonymousId);

      if (distinctId === null) {
        return { status: "skipped", reason: "unidentified" };
      }

      const { properties, losses } = getPostHogProperties(event);

      sdk.capture({
        distinctId,
        event: event.name,
        properties,
        groups: Object.fromEntries(
          Object.entries(event.identity.groups).map(([type, { id }]) => [
            type,
            id,
          ]),
        ),
        timestamp: new Date(event.timestamp),
        uuid: event.id,
      });

      return { status: "submitted", evidence: "sdk-call-returned", losses };
    },
    identify: ({ user }) => {
      if (user.id.length > MAX_DISTINCT_ID_LENGTH) {
        throw new TraceError({
          code: "DELIVERY_FAILED",
          message: `PostHog keeps the first ${MAX_DISTINCT_ID_LENGTH} characters of a distinct id, so this user would share a person with any id that starts the same.`,
        });
      }

      const visitorId = getDistinctId(null, anonymousId);

      if (visitorId === null) {
        return;
      }

      sdk.identify({
        distinctId: user.id,
        properties: { $anon_distinct_id: visitorId },
      });
    },
    traits: ({ user, set, remove }) => {
      const distinctId = getDistinctId(user, anonymousId);

      if (distinctId === null) {
        throw new TraceError({
          code: "UNSUPPORTED",
          message:
            "PostHog keeps traits on a person, and this update has neither a user nor a visitor id PostHog can keep. Pass anonymousId to reach signed-out visitors.",
        });
      }

      // posthog-node sends nothing for an empty list or object.
      sdk.unsetPersonProperties({ distinctId, properties: remove });
      sdk.setPersonProperties({ distinctId, properties: set });

      if (remove.some((name) => name.trim() === "")) {
        throw new TraceError({
          code: "UNSUPPORTED",
          message:
            "posthog-node drops the removal of a blank trait name, so that trait stays on the person; the rest was sent.",
        });
      }
    },
    group: ({ user, group: { type, id, traits } }) => {
      // posthog-node holds no membership: each capture carries its event's own groups.
      if (id === null || Object.keys(traits).length === 0) {
        return;
      }

      const distinctId = getDistinctId(user, anonymousId);

      if (distinctId === null) {
        throw new TraceError({
          code: "UNSUPPORTED",
          message:
            "PostHog files a group's properties under a person, and this update has neither a user nor a visitor id PostHog can keep. Pass anonymousId to reach signed-out visitors.",
        });
      }

      sdk.groupIdentify({
        groupType: type,
        groupKey: id,
        properties: traits,
        distinctId,
      });
    },
    flush: async () => {
      await sdk.flush();

      return { status: "flushed" };
    },
  }),
});
