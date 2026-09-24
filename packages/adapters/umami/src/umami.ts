import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { UmamiAdapterOptions } from "src/types/UmamiAdapterOptions";
import type { UmamiLike } from "src/types/UmamiLike";
import { getUmamiEvent } from "src/utils/getUmamiEvent";

/**
 * Sends each event to Umami as one custom event with its data and the id of
 * the user it was tracked for, through the tracker the application loaded.
 * The id travels on each event and never sticks to the page, so an event of
 * one user is never filed under the next.
 *
 * @example
 * ```ts
 * const trace = new Trace({ events, destinations: { site: umami({ sdk: window.umami }) } });
 * ```
 */
export const umami = <TSdk extends UmamiLike>({
  sdk,
}: UmamiAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "umami",
  open: () => ({
    native: sdk,
    track: (event) => {
      const { name, data, id, losses } = getUmamiEvent(event);

      // Umami's promise settles after the request, a failed one too, so it proves nothing and is not awaited.
      sdk.track((payload) => ({ ...payload, name, data, id })).catch(() => {});

      return { status: "submitted", evidence: "sdk-call-returned", losses };
    },
  }),
});
