import type { AnalyticsAdapter, TrackResult } from "@priemskiyyy/trace";

import type { PlausibleAdapterOptions } from "src/types/PlausibleAdapterOptions";
import type { PlausibleLike } from "src/types/PlausibleLike";
import { getPlausibleProps } from "src/utils/getPlausibleProps";
import { getTrackResult } from "src/utils/getTrackResult";

/**
 * Sends each event to Plausible as one custom event whose props are its
 * flat properties and context as text, through the tracker the application
 * initialized, and answers once Plausible's callback reports the request. No
 * user, trait or group ever reaches Plausible, which forbids identifiers.
 *
 * @example
 * ```ts
 * import { init, track } from "@plausible-analytics/tracker";
 *
 * init({ domain: "example.com" });
 * const trace = new Trace({ events, destinations: { site: plausible({ sdk: { track } }) } });
 * ```
 */
export const plausible = <TSdk extends PlausibleLike>({
  sdk,
}: PlausibleAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "plausible",
  open: () => ({
    native: sdk,
    track: (event) => {
      const { props, losses } = getPlausibleProps(event);

      return new Promise<TrackResult>((resolve) => {
        sdk.track(event.name, {
          props,
          callback: (result) => {
            resolve(getTrackResult(result, losses));
          },
        });
      });
    },
  }),
});
