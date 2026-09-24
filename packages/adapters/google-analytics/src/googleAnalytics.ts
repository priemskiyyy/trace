import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { GoogleAnalyticsAdapterOptions } from "src/types/GoogleAnalyticsAdapterOptions";
import type { GtagLike } from "src/types/GtagLike";
import { MAX_USER_ID_LENGTH } from "src/utils/constants/limits";
import {
  COLLECTION_SWITCH_PREFIX,
  EVENT_NAME,
  RESERVED_EVENT_NAMES,
} from "src/utils/constants/names";
import { createConfigUpdate } from "src/utils/createConfigUpdate";
import { getEventParameters } from "src/utils/getEventParameters";
import { getUserProperties } from "src/utils/getUserProperties";

/**
 * Sends each event to one Google Analytics measurement as the GA4 event its
 * mapping answers, through the `gtag` function the application's Google tag
 * defined. gtag.js applies commands in the order they arrive, so the user id
 * and user properties set before an event are the ones it is sent with.
 *
 * @example
 * ```ts
 * const trace = new Trace({
 *   events,
 *   destinations: {
 *     web: googleAnalytics({
 *       sdk: window.gtag,
 *       measurement: { id: "G-XXXXXXX" },
 *       map: ga4(events, mappings),
 *     }),
 *   },
 * });
 * ```
 */
export const googleAnalytics = <TSdk extends GtagLike>({
  sdk,
  measurement: { id },
  map,
}: GoogleAnalyticsAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => {
  const updateMeasurement = createConfigUpdate(sdk, id);
  const written = new Set<string>();

  return {
    name: "google-analytics",
    open: () => ({
      native: sdk,
      track: (event) => {
        const mapped = map(event);

        if (mapped === null) {
          return { status: "dropped", reason: "provider-filtered" };
        }

        if (
          !EVENT_NAME.test(mapped.name) ||
          RESERVED_EVENT_NAMES.includes(mapped.name)
        ) {
          return {
            status: "dropped",
            reason: "provider-filtered",
            losses: [{ path: "name", reason: "invalid" }],
          };
        }

        const { parameters, losses } = getEventParameters(
          mapped,
          event.context,
        );

        sdk("event", mapped.name, { ...parameters, send_to: id });

        return {
          status: "submitted",
          evidence: "sdk-call-returned",
          losses: [...losses, { path: "timestamp", reason: "unsupported" }],
        };
      },
      identify: ({ user }) => {
        if ([...user.id].length > MAX_USER_ID_LENGTH) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message: `Google Analytics keeps user ids of at most ${MAX_USER_ID_LENGTH} characters.`,
          });
        }

        updateMeasurement({ user_id: user.id });
      },
      traits: (update) => {
        const { properties, complete } = getUserProperties(update);

        if (Object.keys(properties).length > 0) {
          updateMeasurement({ user_properties: properties });
        }

        for (const name of Object.keys(properties)) {
          written.add(name);
        }

        if (!complete) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Google Analytics cannot keep every user property in this update; the others were set.",
          });
        }
      },
      reset: () => {
        updateMeasurement({ user_id: null });

        if (written.size === 0) {
          return;
        }

        updateMeasurement({
          user_properties: Object.fromEntries(
            [...written].map((name) => [name, null]),
          ),
        });
        written.clear();
      },
      collection: (enabled) => {
        Reflect.set(globalThis, `${COLLECTION_SWITCH_PREFIX}${id}`, !enabled);
      },
    }),
  };
};
