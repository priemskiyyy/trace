import type { SegmentLike } from "@priemskiyyy/trace-segment-react-native";

import type { ProviderCall } from "example-shared/simulated/types/ProviderCall";
import { createEventLog } from "example-shared/utils/createEventLog";
import { createValueStore } from "example-shared/utils/createValueStore";

/**
 * An analytics-react-native client mid-initialization: `isReady` and
 * `running` turn true on the next tick, as the native module settling would,
 * and `running.onChange` reports it, the way the README's example listens.
 */
export const createSimulatedSegmentReactNative = () => {
  const inbox = createEventLog<ProviderCall>(20);
  const isReady = { value: false };
  const runningState = createValueStore(false);
  const onChangeListeners = new Set<(running: boolean) => void>();
  const enabled = createValueStore(true);
  let userId: string | null = null;
  let anonymousId = "anon_1";

  setTimeout(() => {
    isReady.value = true;
    runningState.set(true);

    for (const listener of onChangeListeners) {
      listener(true);
    }
  }, 0);

  const base = {
    isReady,
    running: { get: () => runningState.get() },
    track: (
      name: string,
      properties?: Record<string, unknown>,
      enrichment?: (event: { messageId?: string; timestamp?: string }) => {
        messageId?: string;
        timestamp?: string;
      },
    ) => {
      if (!enabled.get()) {
        return Promise.resolve();
      }

      const seed: { messageId?: string; timestamp?: string } = {};
      const enriched = enrichment === undefined ? seed : enrichment(seed);

      inbox.add({
        id: enriched.messageId ?? "unknown",
        eventName: name,
        user: userId ?? anonymousId,
        body: properties ?? {},
        at: Date.now(),
      });

      return Promise.resolve();
    },
    identify: (id?: string) => {
      if (id !== undefined) {
        userId = id;
      }

      return Promise.resolve();
    },
    group: () => Promise.resolve(),
    reset: () => {
      userId = null;
      anonymousId = `anon_${Date.now()}`;

      return Promise.resolve();
    },
    enabled: {
      set: (value: boolean) => {
        enabled.set(value);

        return value;
      },
    },
    flush: () => Promise.resolve(),
    pendingEvents: () => Promise.resolve(0),
  } satisfies SegmentLike;

  const sdk = {
    ...base,
    running: {
      ...base.running,
      onChange: (listener: (running: boolean) => void) => {
        onChangeListeners.add(listener);
      },
    },
  };

  return { sdk, inbox: inbox.log };
};
