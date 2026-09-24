import type { MixpanelLike } from "src/types/MixpanelLike";

/**
 * Options for `mixpanel()`. The application initializes Mixpanel and owns it;
 * Trace only calls it.
 *
 * @example
 * ```ts
 * import { event, Trace } from "@priemskiyyy/trace";
 * import { mixpanel } from "@priemskiyyy/trace-mixpanel";
 * import type { MixpanelAdapterOptions } from "@priemskiyyy/trace-mixpanel";
 * import mixpanelBrowser from "mixpanel-browser";
 *
 * mixpanelBrowser.init("YOUR_PROJECT_TOKEN", { opt_out_tracking_by_default: true });
 *
 * const options: MixpanelAdapterOptions<typeof mixpanelBrowser> = { sdk: mixpanelBrowser };
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
  /** The mixpanel-browser instance the application initialized. */
  sdk: TSdk;
};
