type FakeCall = { method: string; args: unknown[] };

const RESERVED_EVENT_NAMES = Object.freeze([
  "ad_activeview",
  "ad_click",
  "ad_exposure",
  "ad_query",
  "ad_reward",
  "adunit_exposure",
  "app_background",
  "app_clear_data",
  "app_remove",
  "app_store_refund",
  "app_store_subscription_cancel",
  "app_store_subscription_convert",
  "app_store_subscription_renew",
  "app_update",
  "app_upgrade",
  "dynamic_link_app_open",
  "dynamic_link_app_update",
  "dynamic_link_first_open",
  "error",
  "first_open",
  "first_visit",
  "in_app_purchase",
  "notification_dismiss",
  "notification_foreground",
  "notification_open",
  "notification_receive",
  "os_update",
  "session_start",
  "session_start_with_rollout",
  "user_engagement",
]);

/**
 * The modular functions of @react-native-firebase/analytics 26.4.0 the
 * adapter calls, its `Analytics` instance with the `logEvent` of its own, and
 * the functions Trace must never call, recording every call with its
 * arguments in order. Like the real ones, the instance's `logEvent` throws at
 * once on a name the SDK refuses, and `setUserProperties` on a value that is
 * not text; any other answer is a promise that settles once the native SDK
 * ran the call, on a later microtask or, for a method `hold` names, when the
 * test releases it, and rejects with the error `state.failures` holds for its
 * method. With `state.missing`, a native call throws at once, as without the
 * native module.
 *
 * It proves which calls the adapter makes, in which order and with which
 * arguments. It does not model the native SDKs, their queue or their uploads,
 * nor what GA4 keeps; the contracts pin its members to the real SDK's.
 */
export const fakeFirebase = ({ hold = [] }: { hold?: string[] } = {}) => {
  const state: { failures: Record<string, Error>; missing: boolean } = {
    failures: {},
    missing: false,
  };

  const calls: FakeCall[] = [];
  const held: Array<() => void> = [];

  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
  };

  const answer = (method: string) => {
    if (state.missing) {
      throw new Error(
        "You attempted to use a Firebase module that's not installed natively on your project by calling firebase.analytics().",
      );
    }

    return new Promise<void>((resolve, reject) => {
      const settle = () => {
        const failure = state.failures[method];

        if (failure === undefined) {
          resolve();

          return;
        }

        reject(failure);
      };

      if (hold.includes(method)) {
        held.push(settle);

        return;
      }

      queueMicrotask(settle);
    });
  };

  const analytics = {
    app: { name: "[DEFAULT]" },
    logEvent: (name: string, parameters: Record<string, unknown> = {}) => {
      record("analytics.logEvent", name, parameters);

      if (
        RESERVED_EVENT_NAMES.includes(name) ||
        ["firebase_", "google_", "ga_"].some((prefix) =>
          name.startsWith(prefix),
        ) ||
        !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(name)
      ) {
        throw new Error(
          `firebase.analytics().logEvent(*) 'name' the event name '${name}' can not be used.`,
        );
      }

      return answer("analytics.logEvent");
    },
  };

  type FakeAnalytics = typeof analytics;

  const sdk = {
    setUserId: (instance: FakeAnalytics, id: string | null) => {
      record("setUserId", instance, id);

      return answer("setUserId");
    },
    setUserProperties: (
      instance: FakeAnalytics,
      properties: Record<string, unknown>,
    ) => {
      record("setUserProperties", instance, properties);

      for (const [key, value] of Object.entries(properties)) {
        if (value !== null && typeof value !== "string") {
          throw new Error(
            `firebase.analytics().setUserProperties(*) 'properties' value for parameter '${key}' is invalid, expected a string.`,
          );
        }
      }

      return answer("setUserProperties");
    },
    setAnalyticsCollectionEnabled: (
      instance: FakeAnalytics,
      enabled: boolean,
    ) => {
      record("setAnalyticsCollectionEnabled", instance, enabled);

      return answer("setAnalyticsCollectionEnabled");
    },
    getAnalytics: () => {
      record("getAnalytics");

      return analytics;
    },
    initializeAnalytics: () => {
      record("initializeAnalytics");

      return analytics;
    },
    logEvent: (
      instance: FakeAnalytics,
      name: string,
      parameters: Record<string, unknown>,
    ) => {
      record("logEvent", instance, name, parameters);
    },
    resetAnalyticsData: (instance: FakeAnalytics) => {
      record("resetAnalyticsData", instance);

      return answer("resetAnalyticsData");
    },
    setConsent: (instance: FakeAnalytics, consent: Record<string, unknown>) => {
      record("setConsent", instance, consent);

      return answer("setConsent");
    },
    setDefaultEventParameters: (
      instance: FakeAnalytics,
      parameters: Record<string, unknown>,
    ) => {
      record("setDefaultEventParameters", instance, parameters);

      return answer("setDefaultEventParameters");
    },
  };

  return { sdk, analytics, state, calls, held };
};
