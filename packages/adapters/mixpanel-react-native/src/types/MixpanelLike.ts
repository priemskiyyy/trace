/**
 * The part of a mixpanel-react-native `Mixpanel` the adapter calls. The
 * instance the application created and initialized satisfies it, so the
 * package does not import the SDK: the application passes in its instance.
 *
 * @example
 * ```ts
 * import { event, Trace } from "@priemskiyyy/trace";
 * import { mixpanel } from "@priemskiyyy/trace-mixpanel-react-native";
 * import type { MixpanelLike } from "@priemskiyyy/trace-mixpanel-react-native";
 * import { Mixpanel } from "mixpanel-react-native";
 *
 * const client = new Mixpanel("YOUR_PROJECT_TOKEN", false);
 *
 * await client.init();
 *
 * const sdk: MixpanelLike = client;
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
  /** Throws at once on a blank name, and answers nothing even when the SDK drops the event. */
  track: (name: string, properties: Record<string, unknown>) => void;
  /** Settles once the SDK holds the user; identifying the user it holds again changes nothing. */
  identify: (id: string) => Promise<void>;
  /** The profile of the user the SDK holds; its `unset` takes one name. */
  getPeople: () => {
    set: (properties: Record<string, unknown>) => void;
    unset: (name: string) => void;
  };
  /** Registers the membership as a super property every later event carries, and sets it on the profile. */
  setGroup: (type: string, id: string) => void;
  unregisterSuperProperty: (name: string) => void;
  /** Answers before the SDK has forgotten the user, because it does not return its promise. */
  reset: () => void;
};
