import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { VercelAdapterOptions } from "src/types/VercelAdapterOptions";
import type { VercelLike } from "src/types/VercelLike";
import {
  DEFAULT_MAX_PROPERTIES,
  MAX_TEXT_LENGTH,
} from "src/utils/constants/limits";
import { getVercelProperties } from "src/utils/getVercelProperties";

/**
 * Sends each event to Vercel Web Analytics as one custom event with as many
 * of its flat properties as the plan keeps, through the `track` of
 * `@vercel/analytics` the application injected. The context is not sent: it
 * would take the plan's few places.
 *
 * @example
 * ```ts
 * import { inject, track } from "@vercel/analytics";
 *
 * inject();
 * const trace = new Trace({ events, destinations: { site: vercel({ sdk: { track } }) } });
 * ```
 */
export const vercel = <TSdk extends VercelLike>({
  sdk,
  limits,
}: VercelAdapterOptions<TSdk>): AnalyticsAdapter<TSdk> => {
  const maxProperties = limits?.properties ?? DEFAULT_MAX_PROPERTIES;

  return {
    name: "vercel",
    open: () => ({
      native: sdk,
      track: (event) => {
        const { properties, losses } = getVercelProperties(
          event,
          maxProperties,
        );

        if (event.name.length > MAX_TEXT_LENGTH) {
          return {
            status: "dropped",
            reason: "provider-filtered",
            losses: [{ path: "name", reason: "invalid" }, ...losses],
          };
        }

        sdk.track(event.name, properties);

        return { status: "submitted", evidence: "sdk-call-returned", losses };
      },
    }),
  };
};
