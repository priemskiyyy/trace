import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter, AnalyticsSession } from "@priemskiyyy/trace";

import type { SegmentAdapterOptions } from "src/types/SegmentAdapterOptions";
import type { SegmentLike } from "src/types/SegmentLike";
import { MAX_EVENT_SIZE } from "src/utils/constants/limits";
import { getSegmentProperties } from "src/utils/getSegmentProperties";

/**
 * Sends each event to Segment as one `track` call, with its time and its id as
 * the message id, through the analytics-react-native client the application
 * created. The user and their traits become Segment's own `identify` calls,
 * and one group type its `group` call.
 *
 * @example
 * ```ts
 * import { createClient } from "@segment/analytics-react-native";
 *
 * const client = createClient({ writeKey: "YOUR_WRITE_KEY" });
 *
 * const trace = new Trace({
 *   events,
 *   destinations: { segment: segment({ sdk: client, group: { type: "workspace" } }) },
 * });
 * ```
 */
export const segment = <TSdk extends SegmentLike>({
  sdk,
  group,
}: SegmentAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "segment-react-native",
  open: () => {
    // Until it is ready and running the client holds events and files each under whoever it holds when it gets to them.
    if (!sdk.isReady.value || !sdk.running.get()) {
      throw new TraceError({
        code: "NOT_INITIALIZED",
        message:
          "Segment has not started processing events. Call trace.start() again once client.isReady.value and client.running.get() are both true.",
      });
    }

    const session: AnalyticsSession<TSdk> = {
      native: sdk,
      track: async (event) => {
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

        const timestamp = new Date(event.timestamp).toISOString();

        await sdk.track(event.name, properties, (stamped) => ({
          ...stamped,
          messageId: event.id,
          timestamp,
        }));

        return { status: "submitted", evidence: "sdk-call-returned", losses };
      },
      identify: ({ user }) => sdk.identify(user.id),
      traits: ({ set, remove }) =>
        sdk.identify(undefined, {
          ...Object.fromEntries(remove.map((key) => [key, null])),
          ...set,
        }),
      reset: () => sdk.reset(),
      collection: async (enabled) => {
        await sdk.enabled.set(enabled);
      },
      flush: async () => {
        await sdk.flush();

        const pending = await sdk.pendingEvents();

        if (pending === 0) {
          return { status: "flushed" };
        }

        return {
          status: "failed",
          error: new TraceError({
            code: "DELIVERY_FAILED",
            message: `Segment kept ${pending} of its queued events for a retry after the flush.`,
          }),
        };
      },
    };

    if (group === undefined) {
      return session;
    }

    session.group = ({ group: membership }) => {
      if (membership.type !== group.type) {
        throw new TraceError({
          code: "UNSUPPORTED",
          message: `Segment keeps no group type, and this destination sends only the "${group.type}" type.`,
        });
      }

      if (membership.id === null) {
        throw new TraceError({
          code: "UNSUPPORTED",
          message: "Segment has no call to leave a group.",
        });
      }

      return sdk.group(membership.id, membership.traits);
    };

    return session;
  },
});
