import { TraceError } from "@priemskiyyy/trace";
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { AmpliAdapterOptions } from "src/types/AmpliAdapterOptions";
import type { AmpliLike } from "src/types/AmpliLike";
import { createIdentify } from "src/utils/createIdentify";
import { createUploads } from "src/utils/createUploads";
import { getAmplitudeProperties } from "src/utils/getAmplitudeProperties";
import { getPinnedOptions } from "src/utils/getPinnedOptions";

/**
 * Sends each event as one `ampli.track` call with its time and its id as
 * `insert_id`, through the Ampli wrapper the application generated and loaded,
 * and files it under the user and device it was tracked with, which the call
 * carries in its options and, for the plugin from `identityPlugin()`, in its
 * `extra`.
 *
 * @example
 * ```ts
 * import * as amplitude from "@amplitude/analytics-browser";
 * import * as Ampli from "./ampli";
 *
 * await Ampli.ampli.load({ environment: "production" }).promise;
 *
 * const plugin = identityPlugin();
 *
 * Ampli.ampli.client.add(plugin);
 *
 * const trace = new Trace({
 *   events: fromAmpli({ "Checkout Started": Ampli.CheckoutStarted }),
 *   destinations: {
 *     product: ampli({ sdk: Ampli.ampli, Identify: amplitude.Identify, plugin }),
 *   },
 * });
 * ```
 */
export const ampli = <TSdk extends AmpliLike>({
  sdk,
  Identify,
  plugin,
}: AmpliAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "ampli",
  open: () => {
    // Reading ampli.client before ampli.load() logs an error, and until Amplitude's init has finished there is no device to pin.
    if (
      !sdk.isLoaded ||
      !plugin.isSetUp() ||
      sdk.client.getDeviceId() === undefined
    ) {
      throw new TraceError({
        code: "NOT_INITIALIZED",
        message:
          "Ampli has not finished loading with Trace's identity plugin. Await ampli.load().promise, add identityPlugin() with ampli.client.add(), then call trace.start() again.",
      });
    }

    const uploads = createUploads();

    return {
      native: sdk,
      track: (event) => {
        const { properties, losses } = getAmplitudeProperties(event);

        const { promise } = sdk.track(
          { event_type: event.name, event_properties: properties },
          {
            time: event.timestamp,
            insert_id: event.id,
            ...getPinnedOptions(plugin, sdk.client, event.identity.user),
          },
        );

        uploads.add(promise);

        return { status: "submitted", evidence: "sdk-call-returned", losses };
      },
      // Amplitude answers these calls after their upload; the SDK already holds the change when they return.
      identify: ({ user }) => {
        sdk.identify(
          user.id,
          undefined,
          getPinnedOptions(plugin, sdk.client, user),
        );
      },
      traits: (update) => {
        const { identify, refused } = createIdentify(Identify, update);

        sdk.client.identify(
          identify,
          getPinnedOptions(plugin, sdk.client, update.user),
        );

        if (refused.length > 0) {
          throw new TraceError({
            code: "UNSUPPORTED",
            message: `Amplitude cannot take these trait values, so they were left out: ${refused.join(", ")}.`,
          });
        }
      },
      reset: () => {
        sdk.client.reset();
      },
      collection: (enabled) => {
        sdk.client.setOptOut(!enabled);
      },
      flush: ({ signal }) => uploads.flush(sdk.client.flush().promise, signal),
    };
  },
});
