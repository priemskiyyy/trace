import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { HeapAdapterOptions } from "src/types/HeapAdapterOptions";
import type { HeapLike } from "src/types/HeapLike";
import { MAX_EVENT_NAME_LENGTH } from "src/utils/constants/limits";
import { RESERVED_EVENT_NAMES } from "src/utils/constants/names";
import { getEventLosses } from "src/utils/getEventLosses";
import { getUserProperties } from "src/utils/getUserProperties";
import { isRefusedIdentity } from "src/utils/isRefusedIdentity";

/**
 * Sends each event to Heap as one `track` call with its context under its
 * properties, through the heap.js global the application loaded. The user and
 * their traits become Heap's own identity and user properties.
 *
 * @example
 * ```ts
 * // currentHeap reads window.heap on every call, because heap.js replaces it when it loads.
 * const trace = new Trace({ events, destinations: { product: heap({ sdk: currentHeap }) } });
 *
 * window.heap.onReady(trace.start);
 * ```
 */
export const heap = <TSdk extends HeapLike>({
  sdk,
}: HeapAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "heap",
  open: () => {
    // heap.js replaces the snippet's window.heap when it loads and never replays a call made on the stub after that.
    if (sdk.loaded !== true) {
      throw new TraceError({
        code: "NOT_INITIALIZED",
        message:
          "Heap has not loaded. Call trace.start() again from heap.onReady, over an sdk that reads the current window.heap.",
      });
    }

    return {
      native: sdk,
      track: (event) => {
        if (
          event.name.length > MAX_EVENT_NAME_LENGTH ||
          RESERVED_EVENT_NAMES.includes(event.name)
        ) {
          return {
            status: "dropped",
            reason: "provider-filtered",
            losses: [
              { path: "name", reason: "invalid" },
              ...getEventLosses(event),
            ],
          };
        }

        sdk.track(event.name, { ...event.context, ...event.properties });

        return {
          status: "submitted",
          evidence: "sdk-call-returned",
          losses: getEventLosses(event),
        };
      },
      identify: ({ user }) => {
        // Heap keeps an ignored identity's events on its anonymous user, whose history the next identify takes over.
        if (isRefusedIdentity(user.id)) {
          throw new TraceError({
            code: "DELIVERY_FAILED",
            message:
              "Heap would ignore or cut this identity and file its events under another user, so it is not sent.",
          });
        }

        sdk.identify(user.id);
      },
      traits: ({ set, remove }) => {
        const { properties, isComplete } = getUserProperties(set);

        if (Object.keys(properties).length > 0) {
          sdk.addUserProperties(properties);
        }

        if (remove.length > 0 || !isComplete) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Heap cannot remove a user property, nor keep a blank, nested or over-long one; the others were set.",
          });
        }
      },
      reset: () => {
        sdk.resetIdentity();
      },
    };
  },
});
