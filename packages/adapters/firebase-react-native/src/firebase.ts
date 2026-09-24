import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { AnalyticsLike } from "src/types/AnalyticsLike";
import type { FirebaseAdapterOptions } from "src/types/FirebaseAdapterOptions";
import { MAX_USER_ID_LENGTH } from "src/utils/constants/limits";
import { EVENT_NAME, RESERVED_EVENT_NAMES } from "src/utils/constants/names";
import { getEventParameters } from "src/utils/getEventParameters";
import { getUserProperties } from "src/utils/getUserProperties";

/**
 * Sends each event to Google Analytics as the GA4 event its mapping answers,
 * through the React Native Firebase analytics the application set up, and
 * answers once the native SDK has taken it.
 *
 * @example
 * ```ts
 * import * as FirebaseAnalytics from "@react-native-firebase/analytics";
 *
 * const trace = new Trace({
 *   events,
 *   destinations: {
 *     product: firebase({
 *       sdk: FirebaseAnalytics,
 *       analytics: FirebaseAnalytics.getAnalytics(),
 *       map: ga4(events, mappings),
 *     }),
 *   },
 *   consent: { product: ["analytics"] },
 * });
 * ```
 */
export const firebase = <TAnalytics extends AnalyticsLike>({
  sdk,
  analytics,
  map,
}: FirebaseAdapterOptions<TAnalytics>): AnalyticsAdapter<TAnalytics> => {
  const written = new Set<string>();

  return {
    name: "firebase-react-native",
    open: () => ({
      native: analytics,
      track: async (event) => {
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

        await analytics.logEvent(mapped.name, parameters);

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
            message: `Firebase keeps user ids of at most ${MAX_USER_ID_LENGTH} characters.`,
          });
        }

        return sdk.setUserId(analytics, user.id);
      },
      traits: async (update) => {
        const { properties, complete } = getUserProperties(update);
        const names = Object.keys(properties);

        for (const name of names) {
          written.add(name);
        }

        if (names.length > 0) {
          await sdk.setUserProperties(analytics, properties);
        }

        if (!complete) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Firebase cannot keep every user property in this update; the others were set.",
          });
        }
      },
      reset: async () => {
        const names = [...written];

        written.clear();

        try {
          await sdk.setUserId(analytics, null);

          if (names.length > 0) {
            await sdk.setUserProperties(
              analytics,
              Object.fromEntries(names.map((name) => [name, null])),
            );
          }
        } catch (error) {
          for (const name of names) {
            written.add(name);
          }

          throw error;
        }
      },
      collection: (enabled) =>
        sdk.setAnalyticsCollectionEnabled(analytics, enabled),
    }),
  };
};
