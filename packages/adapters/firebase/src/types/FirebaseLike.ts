/**
 * The part of the Firebase modular analytics API the adapter calls. The
 * namespace of `firebase/analytics` satisfies it, so the package imports none.
 *
 * @example
 * ```ts
 * import * as FirebaseAnalytics from "firebase/analytics";
 *
 * const sdk: FirebaseLike<FirebaseAnalytics.Analytics> = FirebaseAnalytics;
 * ```
 */
export type FirebaseLike<TAnalytics = unknown> = {
  /** Returns before gtag sees the event, so a later `setUserId` can reach gtag first. */
  logEvent: (
    analytics: TAnalytics,
    name: string,
    parameters: Record<string, unknown>,
  ) => void;
  setUserId: (analytics: TAnalytics, id: string | null) => void;
  /** Merges the given user properties; a `null` value removes one. */
  setUserProperties: (
    analytics: TAnalytics,
    properties: Record<string, unknown>,
  ) => void;
  /** Flips `window["ga-disable-<measurement id>"]` once Firebase has initialized. */
  setAnalyticsCollectionEnabled: (
    analytics: TAnalytics,
    enabled: boolean,
  ) => void;
};
