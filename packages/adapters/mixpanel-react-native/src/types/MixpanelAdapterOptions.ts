import type { MixpanelLike } from "src/types/MixpanelLike";

/**
 * Options for `mixpanel()`. The application creates and initializes Mixpanel
 * and owns it; Trace only calls it.
 *
 * @example
 * ```ts
 * import { event, Trace } from "@priemskiyyy/trace";
 * import { mixpanel } from "@priemskiyyy/trace-mixpanel-react-native";
 * import type { MixpanelAdapterOptions } from "@priemskiyyy/trace-mixpanel-react-native";
 * import { Mixpanel } from "mixpanel-react-native";
 *
 * const client = new Mixpanel("YOUR_PROJECT_TOKEN", false);
 *
 * await client.init();
 *
 * const options: MixpanelAdapterOptions<Mixpanel> = { sdk: client };
 *
 * const trace = new Trace({
 *   events: { "App Opened": event() },
 *   destinations: { product: mixpanel(options) },
 *   consent: { product: ["analytics"] },
 * });
 *
 * trace.consent.set({ analytics: "granted" });
 * trace.start();
 * ```
 */
export type MixpanelAdapterOptions<TSdk extends MixpanelLike> = {
  /** The mixpanel-react-native instance the application created and initialized. */
  sdk: TSdk;
};
