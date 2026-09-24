import type {
  AnalyticsLike,
  FirebaseLike,
} from "@priemskiyyy/trace-firebase-react-native";

import type { ProviderCall } from "example-shared/simulated/types/ProviderCall";
import { createEventLog } from "example-shared/utils/createEventLog";
import { createValueStore } from "example-shared/utils/createValueStore";

/** The React Native Firebase analytics namespace and its `Analytics` instance, recording every `logEvent` in memory. */
export const createSimulatedFirebaseReactNative = () => {
  const inbox = createEventLog<ProviderCall>(20);
  const userId = createValueStore<string | null>(null);
  const collecting = createValueStore(true);
  let nextId = 1;

  const analytics = {
    logEvent: (name: string, parameters: Record<string, unknown>) => {
      inbox.add({
        id: `firebase_${nextId}`,
        eventName: name,
        user: userId.get(),
        body: parameters,
        at: Date.now(),
      });
      nextId += 1;

      return Promise.resolve();
    },
  } satisfies AnalyticsLike;

  const sdk = {
    setUserId: (_analytics: typeof analytics, id: string | null) => {
      userId.set(id);

      return Promise.resolve();
    },
    setUserProperties: () => Promise.resolve(),
    setAnalyticsCollectionEnabled: (
      _analytics: typeof analytics,
      enabled: boolean,
    ) => {
      collecting.set(enabled);

      return Promise.resolve();
    },
  } satisfies FirebaseLike<typeof analytics>;

  return { sdk, analytics, inbox: inbox.log, collecting };
};
