/**
 * The part of mixpanel-browser the adapter calls. The default export of
 * `mixpanel-browser` satisfies it, and so does a named instance from
 * `init(token, config, name)`, so the package does not import the SDK: the
 * application passes in the instance it initialized.
 *
 * @example
 * ```ts
 * import { event, Trace } from "@priemskiyyy/trace";
 * import { mixpanel } from "@priemskiyyy/trace-mixpanel";
 * import type { MixpanelLike } from "@priemskiyyy/trace-mixpanel";
 * import mixpanelBrowser from "mixpanel-browser";
 *
 * mixpanelBrowser.init("YOUR_PROJECT_TOKEN", { opt_out_tracking_by_default: true });
 *
 * const sdk: MixpanelLike = mixpanelBrowser;
 *
 * const trace = new Trace({
 *   events: { "App Opened": event() },
 *   destinations: { product: mixpanel({ sdk }) },
 *   consent: { product: ["analytics"] },
 * });
 *
 * trace.consent.set({ analytics: "granted" });
 * trace.start();
 * ```
 */
export type MixpanelLike = {
  /** Set by `init`, though mixpanel-browser's types leave it out; before it, every method throws. */
  __loaded?: boolean;
  /** Answers the payload once queued or sent, nothing when Mixpanel filters the event, `null` when `before_send_events` drops an immediate request, and `false` when an immediate request cannot start. */
  track: (name: string, properties: Record<string, unknown>) => unknown;
  /** Answers -1 when Mixpanel refuses the id: one that starts with `$device:`, or one a `before_identify` hook answers `undefined` for. */
  identify: (id: string) => -1 | undefined;
  people: {
    set: (properties: Record<string, unknown>) => void;
    unset: (names: string[]) => void;
  };
  set_group: (type: string, id: string) => void;
  get_group: (
    type: string,
    id: string,
  ) => {
    set: (properties: Record<string, unknown>) => void;
    unset: (name: string) => void;
  };
  unregister: (name: string) => void;
  reset: () => void;
  opt_out_tracking: (options: { delete_user: boolean }) => void;
  opt_in_tracking: (options: { track: () => void }) => void;
};
