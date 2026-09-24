/**
 * The part of the modular React Native Firebase analytics API the adapter
 * calls. The namespace of `@react-native-firebase/analytics` satisfies it, so
 * the package imports none.
 *
 * @example
 * ```ts
 * import * as FirebaseAnalytics from "@react-native-firebase/analytics";
 *
 * const sdk: FirebaseLike<FirebaseAnalytics.Analytics> = FirebaseAnalytics;
 * ```
 */
export type FirebaseLike<TAnalytics> = {
  /** Settles once the native SDK has set the id; `null` clears it. */
  setUserId: (analytics: TAnalytics, id: string | null) => Promise<void>;
  /** Throws at once on a value that is not text; `null` removes a property. */
  setUserProperties: (
    analytics: TAnalytics,
    properties: Record<string, string | null>,
  ) => Promise<void>;
  /** The native SDK keeps the setting across launches. */
  setAnalyticsCollectionEnabled: (
    analytics: TAnalytics,
    enabled: boolean,
  ) => Promise<void>;
};
