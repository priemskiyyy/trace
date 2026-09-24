import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { FirebaseAdapterOptions } from "src/types/FirebaseAdapterOptions";
import { MAX_USER_ID_LENGTH } from "src/utils/constants/limits";
import { EVENT_NAME, RESERVED_EVENT_NAMES } from "src/utils/constants/names";
import { createProcessingBarrier } from "src/utils/createProcessingBarrier";
import { getEventParameters } from "src/utils/getEventParameters";
import { getUserProperties } from "src/utils/getUserProperties";

/**
 * Sends each event to Google Analytics as the GA4 event its mapping answers,
 * through the Firebase modular SDK the application initialized, and holds
 * every user change until Firebase has processed the events before it.
 *
 * @example
 * ```ts
 * import * as FirebaseAnalytics from "firebase/analytics";
 *
 * const trace = new Trace({
 *   events,
 *   destinations: {
 *     product: firebase({
 *       sdk: FirebaseAnalytics,
 *       analytics: FirebaseAnalytics.getAnalytics(app),
 *       map: ga4(events, mappings),
 *     }),
 *   },
 * });
 * ```
 */
export const firebase = <TAnalytics>({
  sdk,
  analytics,
  map,
}: FirebaseAdapterOptions<TAnalytics>): AnalyticsAdapter<TAnalytics> => {
  const barrier = createProcessingBarrier();
  const written = new Set<string>();

  return {
    name: "firebase",
    open: () => ({
      native: analytics,
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

        const handleProcessed = barrier.begin();

        try {
          sdk.logEvent(analytics, mapped.name, {
            ...parameters,
            event_callback: handleProcessed,
          });
        } catch (error) {
          handleProcessed();

          return { status: "failed", error };
        }

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

        return barrier.run(() => {
          sdk.setUserId(analytics, user.id);
        });
      },
      traits: (update) =>
        barrier.run(() => {
          const { properties, complete } = getUserProperties(update);

          if (Object.keys(properties).length > 0) {
            sdk.setUserProperties(analytics, properties);
          }

          for (const name of Object.keys(properties)) {
            written.add(name);
          }

          if (!complete) {
            throw new TraceError({
              code: "UNSUPPORTED",
              message:
                "Firebase cannot keep every user property in this update; the others were set.",
            });
          }
        }),
      reset: () =>
        barrier.run(() => {
          sdk.setUserId(analytics, null);

          if (written.size === 0) {
            return;
          }

          sdk.setUserProperties(
            analytics,
            Object.fromEntries([...written].map((name) => [name, null])),
          );
          written.clear();
        }),
      collection: (enabled) => {
        if (!enabled) {
          barrier.cancel();
        }

        sdk.setAnalyticsCollectionEnabled(analytics, enabled);
      },
      dispose: barrier.cancel,
    }),
  };
};
