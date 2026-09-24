import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { FathomAdapterOptions } from "src/types/FathomAdapterOptions";
import type { FathomLike } from "src/types/FathomLike";
import { getFathomEvent } from "src/utils/getFathomEvent";

/**
 * Sends each event to Fathom as one event by its name, with the value in
 * cents that `value` answers for it, through the `fathom-client` the
 * application loaded. Fathom keeps nothing else, so every property is
 * reported as lost.
 *
 * @example
 * ```ts
 * import * as Fathom from "fathom-client";
 *
 * Fathom.load("YOUR_SITE_ID");
 * const trace = new Trace({ events, destinations: { site: fathom({ sdk: Fathom }) } });
 * ```
 */
export const fathom = <TSdk extends FathomLike>({
  sdk,
  value,
}: FathomAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => ({
  name: "fathom",
  open: () => ({
    native: sdk,
    track: (event) => {
      const { options, losses } = getFathomEvent(event, value?.(event) ?? null);

      sdk.trackEvent(event.name, options);

      return { status: "submitted", evidence: "sdk-call-returned", losses };
    },
  }),
});
