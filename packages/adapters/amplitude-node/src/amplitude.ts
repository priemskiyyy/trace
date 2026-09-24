import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { AmplitudeAdapterOptions } from "src/types/AmplitudeAdapterOptions";
import type { AmplitudeLike } from "src/types/AmplitudeLike";
import { createIdentify } from "src/utils/createIdentify";
import { createUploads } from "src/utils/createUploads";
import { getAmplitudeIdentity } from "src/utils/getAmplitudeIdentity";
import { getAmplitudeProperties } from "src/utils/getAmplitudeProperties";

/**
 * Sends each event to Amplitude as one `track` call for its user and the
 * visitor's device, with its time and its id as `insert_id`, through the
 * Amplitude Node SDK the application initialized. Traits and groups become
 * `identify`, `setGroup` and `groupIdentify` calls for the same ids.
 *
 * @example
 * ```ts
 * import * as Amplitude from "@amplitude/analytics-node";
 *
 * Amplitude.init("amplitude_api_key");
 *
 * const trace = new Trace({
 *   events,
 *   destinations: {
 *     product: amplitude({ sdk: Amplitude, Identify: Amplitude.Identify, anonymousId: visitorId }),
 *   },
 * });
 * ```
 */
export const amplitude = <TSdk extends AmplitudeLike>({
  sdk,
  Identify,
  anonymousId,
}: AmplitudeAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "amplitude-node",
  open: () => {
    const uploads = createUploads();

    return {
      native: sdk,
      track: (event) => {
        const identity = getAmplitudeIdentity(event.identity.user, anonymousId);

        if (identity === null) {
          return { status: "skipped", reason: "unidentified" };
        }

        const { properties, losses } = getAmplitudeProperties(event);

        uploads.add(
          sdk.track(event.name, properties, {
            ...identity,
            time: event.timestamp,
            insert_id: event.id,
          }).promise,
        );

        return { status: "submitted", evidence: "sdk-call-returned", losses };
      },
      traits: ({ user, set, remove }) => {
        const identity = getAmplitudeIdentity(user, anonymousId);

        if (identity === null) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Amplitude files user properties under a user id or a device id, and this update has neither. Pass anonymousId to reach signed-out visitors.",
          });
        }

        const { identify, refusal } = createIdentify(
          Identify,
          "traits",
          set,
          remove,
        );

        uploads.add(sdk.identify(identify, identity).promise);

        if (refusal !== null) {
          throw refusal;
        }
      },
      group: ({ user, group: { type, id, traits } }) => {
        const identity = getAmplitudeIdentity(user, anonymousId);

        if (identity === null) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message:
              "Amplitude files a group under a user id or a device id, and this update has neither. Pass anonymousId to reach signed-out visitors.",
          });
        }

        // Amplitude documents no way to leave a group, so an empty list overwrites the membership.
        uploads.add(sdk.setGroup(type, id ?? [], identity).promise);

        if (id === null || Object.keys(traits).length === 0) {
          return;
        }

        const { identify, refusal } = createIdentify(
          Identify,
          `group.${type}`,
          traits,
          [],
        );

        uploads.add(sdk.groupIdentify(type, id, identify, identity).promise);

        if (refusal !== null) {
          throw refusal;
        }
      },
      flush: ({ signal }) => uploads.flush(sdk.flush().promise, signal),
    };
  },
});
