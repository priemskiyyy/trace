import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter, AnalyticsSession } from "@priemskiyyy/trace";

import type { SegmentAdapterOptions } from "src/types/SegmentAdapterOptions";
import type { SegmentLike } from "src/types/SegmentLike";
import { MAX_EVENT_SIZE } from "src/utils/constants/limits";
import { createFlush } from "src/utils/createFlush";
import { getSegmentIdentity } from "src/utils/getSegmentIdentity";
import { getSegmentProperties } from "src/utils/getSegmentProperties";

/**
 * Sends each event to Segment as one `track` call for its user and the
 * visitor's anonymous id, with its time and its id as the message id, through
 * the analytics-node client the application constructed. Traits and one group
 * type become Segment's own `identify` and `group` calls for the same ids.
 *
 * @example
 * ```ts
 * import { Analytics } from "@segment/analytics-node";
 *
 * const analytics = new Analytics({ writeKey: "YOUR_WRITE_KEY" });
 *
 * const trace = new Trace({
 *   events,
 *   destinations: { segment: segment({ sdk: analytics, anonymousId: visitorId }) },
 * });
 * ```
 */
export const segment = <TSdk extends SegmentLike>({
  sdk,
  group,
  anonymousId,
}: SegmentAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => {
  const flush = createFlush(sdk);

  return {
    name: "segment-node",
    open: () => {
      const session: AnalyticsSession<TSdk> = {
        native: sdk,
        track: (event) => {
          const identity = getSegmentIdentity(event.identity.user, anonymousId);

          if (identity === null) {
            return { status: "skipped", reason: "unidentified" };
          }

          const { properties, losses } = getSegmentProperties(event);

          const size = new TextEncoder().encode(
            JSON.stringify({ event: event.name, properties }),
          ).length;

          if (size > MAX_EVENT_SIZE) {
            return {
              status: "dropped",
              reason: "provider-filtered",
              losses: [...losses, { path: "properties", reason: "invalid" }],
            };
          }

          // analytics-node reports a batch only once it was sent, long after the call.
          sdk.track({
            ...identity,
            event: event.name,
            properties,
            timestamp: new Date(event.timestamp),
            messageId: event.id,
          });

          return { status: "submitted", evidence: "sdk-call-returned", losses };
        },
        traits: ({ user, set, remove }) => {
          const identity = getSegmentIdentity(user, anonymousId);

          if (identity === null) {
            throw new TraceError({
              code: "UNSUPPORTED",
              message:
                "Segment files traits under a user id or an anonymous id, and this update has neither. Pass anonymousId to reach signed-out visitors.",
            });
          }

          sdk.identify({
            ...identity,
            traits: {
              ...Object.fromEntries(remove.map((key) => [key, null])),
              ...set,
            },
          });
        },
        flush,
      };

      if (group === undefined) {
        return session;
      }

      session.group = ({ user, group: membership }) => {
        if (membership.type !== group.type) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message: `Segment keeps one group, and this destination sends only the "${group.type}" type.`,
          });
        }

        if (membership.id === null) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message: "Segment has no call to leave a group.",
          });
        }

        const identity = getSegmentIdentity(user, anonymousId);

        if (identity === null) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Segment files a group under a user id or an anonymous id, and this update has neither. Pass anonymousId to reach signed-out visitors.",
          });
        }

        sdk.group({
          ...identity,
          groupId: membership.id,
          traits: membership.traits,
        });
      };

      return session;
    },
  };
};
