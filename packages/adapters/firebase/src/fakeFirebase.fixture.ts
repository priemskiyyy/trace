import { vi } from "vitest";

type FakeAnalytics = {
  app: { name: string; options: { appId: string; measurementId: string } };
};

/**
 * The modular analytics functions of firebase 12.19.0 (@firebase/analytics
 * 0.10.25) the adapter calls, and the initialization functions Trace must
 * never call. Like the real ones they return before gtag runs
 * `event_callback`, which runs on a later microtask or waits while `hold`
 * keeps it for the test, and they throw at once after the app was deleted.
 * It does not model Firebase's queue before initialization or its reordering
 * of commands: `firebase.sdk.test.ts` runs the real SDK for those.
 */
export const fakeFirebase = ({ hold = false }: { hold?: boolean } = {}) => {
  const analytics: FakeAnalytics = {
    app: {
      name: "[DEFAULT]",
      options: {
        appId: "1:1234567890:web:0a1b2c3d4e5f",
        measurementId: "G-TRACE",
      },
    },
  };

  const state = { deleted: false };
  const callbacks: Array<() => void> = [];

  const calls = {
    getAnalytics: 0,
    initializeAnalytics: 0,
    isSupported: 0,
    settings: 0,
    setConsent: 0,
    setDefaultEventParameters: 0,
  };

  const readAppId = (instance: FakeAnalytics) => {
    if (state.deleted) {
      throw new Error(
        "Firebase: Firebase App named '[DEFAULT]' already deleted (app/app-deleted).",
      );
    }

    return instance.app.options.appId;
  };

  const sdk = {
    logEvent: vi.fn(
      (
        instance: FakeAnalytics,
        _name: string,
        parameters: Record<string, unknown> = {},
      ) => {
        readAppId(instance);

        const callback = parameters["event_callback"];

        if (typeof callback !== "function") {
          return;
        }

        const handleProcessed = () => {
          callback();
        };

        callbacks.push(handleProcessed);

        if (!hold) {
          queueMicrotask(handleProcessed);
        }
      },
    ),
    setUserId: vi.fn((instance: FakeAnalytics) => {
      readAppId(instance);
    }),
    setUserProperties: vi.fn((instance: FakeAnalytics) => {
      readAppId(instance);
    }),
    setAnalyticsCollectionEnabled: vi.fn((instance: FakeAnalytics) => {
      readAppId(instance);
    }),
    getAnalytics: () => {
      calls.getAnalytics += 1;

      return analytics;
    },
    initializeAnalytics: () => {
      calls.initializeAnalytics += 1;

      return analytics;
    },
    isSupported: () => {
      calls.isSupported += 1;

      return Promise.resolve(true);
    },
    settings: () => {
      calls.settings += 1;
    },
    setConsent: () => {
      calls.setConsent += 1;
    },
    setDefaultEventParameters: () => {
      calls.setDefaultEventParameters += 1;
    },
  };

  return { sdk, analytics, state, callbacks, calls };
};
