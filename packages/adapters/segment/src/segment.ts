import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter, AnalyticsSession } from "@priemskiyyy/trace";

import type { SegmentAdapterOptions } from "src/types/SegmentAdapterOptions";
import type { SegmentLike } from "src/types/SegmentLike";
import { MAX_EVENT_SIZE } from "src/utils/constants/limits";
import { getSegmentProperties } from "src/utils/getSegmentProperties";

/**
 * Sends each event to Segment as one `track` call, with its time and its id as
 * the message id, through the analytics-next instance the application loaded.
 * The user and their traits become Segment's own `identify` calls, and one
 * group type its `group` call.
 *
 * @example
 * ```ts
 * import { AnalyticsBrowser } from "@segment/analytics-next";
 *
 * const [analytics] = await AnalyticsBrowser.load({ writeKey });
 *
 * const trace = new Trace({
 *   events,
 *   destinations: { segment: segment({ sdk: analytics, group: { type: "workspace" } }) },
 * });
 * ```
 */
export const segment = <TSdk extends SegmentLike>({
  sdk,
  group,
}: SegmentAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "segment",
  open: () => {
    if (!sdk.initialized) {
      throw new TraceError({
        code: "NOT_INITIALIZED",
        message:
          "Segment has not loaded. Pass the Analytics that AnalyticsBrowser.load resolves with, then call trace.start() again.",
      });
    }

    // analytics-next applies each call when it returns; its promise settles after the first attempt and proves no more.
    const session: AnalyticsSession<TSdk> = {
      native: sdk,
      track: (event) => {
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

        sdk
          .track(event.name, properties, {
            timestamp: new Date(event.timestamp),
            messageId: event.id,
          })
          .catch(() => {});

        return { status: "submitted", evidence: "sdk-call-returned", losses };
      },
      identify: ({ user }) => {
        sdk.identify(user.id).catch(() => {});
      },
      traits: ({ set, remove }) => {
        sdk
          .identify({
            ...Object.fromEntries(remove.map((key) => [key, null])),
            ...set,
          })
          .catch(() => {});
      },
      reset: () => {
        sdk.reset();
      },
    };

    if (group === undefined) {
      return session;
    }

    session.group = ({ group: membership }) => {
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

      sdk.group(membership.id, membership.traits).catch(() => {});
    };

    return session;
  },
});
