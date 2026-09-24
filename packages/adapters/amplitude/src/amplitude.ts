import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { AmplitudeAdapterOptions } from "src/types/AmplitudeAdapterOptions";
import type { AmplitudeLike } from "src/types/AmplitudeLike";
import { applyGroup } from "src/utils/applyGroup";
import { applyPinnedCall } from "src/utils/applyPinnedCall";
import { applyTraits } from "src/utils/applyTraits";
import { createPendingUploads } from "src/utils/createPendingUploads";
import { getAmplitudeProperties } from "src/utils/getAmplitudeProperties";
import { getFlushResult } from "src/utils/getFlushResult";

/**
 * Sends each event to Amplitude as one `track` call with its time and its id
 * as `insert_id`, through the browser or React Native SDK the application
 * initialized, and files it under the user and device it was tracked with
 * through the plugin from `identityPlugin()`.
 *
 * @example
 * ```ts
 * import * as Amplitude from "@amplitude/analytics-browser";
 *
 * await Amplitude.init("amplitude_api_key", { autocapture: false, optOut: true })
 *   .promise;
 *
 * const plugin = identityPlugin();
 *
 * Amplitude.add(plugin);
 *
 * const trace = new Trace({
 *   events,
 *   destinations: {
 *     product: amplitude({ sdk: Amplitude, Identify: Amplitude.Identify, plugin }),
 *   },
 *   consent: { product: ["analytics"] },
 * });
 * ```
 */
export const amplitude = <TSdk extends AmplitudeLike>(
  options: AmplitudeAdapterOptions<TSdk>,
): AnalyticsAdapter<TSdk> => ({
  name: "amplitude",
  open: () => {
    const { sdk, plugin } = options;

    if (!plugin.isSetUp() || sdk.getDeviceId() === undefined) {
      throw new TraceError({
        code: "NOT_INITIALIZED",
        message:
          "Amplitude has not finished initializing with Trace's identity plugin. Await its init().promise, add identityPlugin() with add(), then call trace.start() again.",
      });
    }

    const uploads = createPendingUploads();

    return {
      native: sdk,
      track: (event) => {
        const { properties, losses } = getAmplitudeProperties(event);

        const { promise } = applyPinnedCall(
          { sdk, plugin },
          event.identity.user,
          (pinned) =>
            sdk.track(event.name, properties, {
              time: event.timestamp,
              insert_id: event.id,
              ...pinned,
            }),
        );

        uploads.add(promise);

        return { status: "submitted", evidence: "sdk-call-returned", losses };
      },
      identify: ({ user }) => {
        sdk.setUserId(user.id);
      },
      traits: (update) => {
        applyTraits(options, update);
      },
      group: (update) => {
        applyGroup(options, update);
      },
      reset: () => {
        sdk.reset();
      },
      collection: (enabled) => {
        sdk.setOptOut(!enabled);
      },
      flush: () => getFlushResult(sdk.flush().promise, uploads.values()),
    };
  },
});
