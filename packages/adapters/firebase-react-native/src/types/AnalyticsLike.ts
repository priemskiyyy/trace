/**
 * The part of the React Native Firebase `Analytics` instance the adapter
 * calls: its own `logEvent`, which answers the promise the modular `logEvent`
 * discards.
 *
 * @example
 * ```ts
 * import { getAnalytics } from "@react-native-firebase/analytics";
 *
 * const analytics: AnalyticsLike = getAnalytics();
 * ```
 */
export type AnalyticsLike = {
  /** Throws at once on a name the SDK refuses, and settles once the native SDK has logged the event. */
  logEvent: (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<void>;
};
