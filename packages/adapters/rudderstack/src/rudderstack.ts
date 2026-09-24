import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter, AnalyticsSession } from "@priemskiyyy/trace";

import type { RudderStackAdapterOptions } from "src/types/RudderStackAdapterOptions";
import type { RudderStackLike } from "src/types/RudderStackLike";
import { MAX_EVENT_SIZE } from "src/utils/constants/limits";
import { GROUP_RESET_OPTIONS, RESET_OPTIONS } from "src/utils/constants/reset";
import { getNullPaths } from "src/utils/getNullPaths";
import { getRudderStackProperties } from "src/utils/getRudderStackProperties";
import { getRudderStackTraits } from "src/utils/getRudderStackTraits";

/**
 * Sends each event to RudderStack as one `track` call with its time as the
 * original timestamp, through the RudderStack instance the application
 * created. The user and their traits become RudderStack's own `identify`
 * calls, and one group type its `group` call.
 *
 * @example
 * ```ts
 * import { RudderAnalytics } from "@rudderstack/analytics-js";
 *
 * const rudderanalytics = new RudderAnalytics();
 *
 * rudderanalytics.load(writeKey, dataPlaneUrl);
 *
 * const trace = new Trace({
 *   events,
 *   destinations: { warehouse: rudderstack({ sdk: rudderanalytics, group: { type: "workspace" } }) },
 * });
 * ```
 */
export const rudderstack = <TSdk extends RudderStackLike>({
  sdk,
  group,
}: RudderStackAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "rudderstack",
  open: () => {
    const session: AnalyticsSession<TSdk> = {
      native: sdk,
      track: (event) => {
        const { properties, losses } = getRudderStackProperties(event);

        // Measured as RudderStack sends it, without the null object members its serializer leaves out.
        const size = new TextEncoder().encode(
          JSON.stringify(
            { event: event.name, properties },
            (_key: string, value: unknown) =>
              value === null ? undefined : value,
          ),
        ).length;

        if (size > MAX_EVENT_SIZE) {
          return {
            status: "dropped",
            reason: "provider-filtered",
            losses: [{ path: "properties", reason: "invalid" }, ...losses],
          };
        }

        sdk.track(event.name, properties, {
          originalTimestamp: new Date(event.timestamp).toISOString(),
        });

        return { status: "submitted", evidence: "sdk-call-returned", losses };
      },
      // An id without traits would clear the traits RudderStack holds, those set while anonymous included.
      identify: ({ user }) => {
        sdk.identify(user.id, {});
      },
      traits: (update) => {
        const { traits, isComplete } = getRudderStackTraits(update);

        if (Object.keys(traits).length > 0) {
          sdk.identify(traits);
        }

        if (!isComplete) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "RudderStack keeps a removed trait on its profiles and merges an object or list trait into the one it holds, so neither was applied as asked; the rest of the update was sent.",
          });
        }
      },
      reset: () => {
        sdk.reset(RESET_OPTIONS);
      },
    };

    if (group === undefined) {
      return session;
    }

    session.group = ({ group: membership }) => {
      if (membership.type !== group.type) {
        throw new TraceError({
          code: "UNSUPPORTED",
          message: `RudderStack keeps one group, and this destination sends only the "${group.type}" type.`,
        });
      }

      if (membership.id === null) {
        throw new TraceError({
          code: "UNSUPPORTED",
          message: "RudderStack has no call to leave a group.",
        });
      }

      // RudderStack merges a group's traits into those of the group it held before.
      sdk.reset(GROUP_RESET_OPTIONS);
      sdk.group(membership.id, membership.traits);

      if (getNullPaths(membership.traits, "traits").length > 0) {
        throw new TraceError({
          code: "UNSUPPORTED",
          message:
            "RudderStack leaves out every null it sends, so a removed group trait stays on the group; the rest of the update was sent.",
        });
      }
    };

    return session;
  },
});
