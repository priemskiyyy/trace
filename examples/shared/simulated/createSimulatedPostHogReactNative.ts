import type { PostHogLike } from "@priemskiyyy/trace-posthog-react-native";

import type { ProviderCall } from "example-shared/simulated/types/ProviderCall";
import { createEventLog } from "example-shared/utils/createEventLog";
import { createValueStore } from "example-shared/utils/createValueStore";

/** A posthog-react-native client whose storage has already loaded, recording every capture in memory. */
export const createSimulatedPostHogReactNative = () => {
  const inbox = createEventLog<ProviderCall>(20);
  const collecting = createValueStore(true);
  let distinctId = "anonymous";
  let groups: Record<string, string | number> = {};

  const sdk = {
    isDisabled: false,
    ready: () => Promise.resolve(),
    capture: (
      event: string,
      properties?: Record<string, unknown>,
      options?: { timestamp: Date; uuid: string },
    ) => {
      inbox.add({
        id: options?.uuid ?? "unknown",
        eventName: event,
        user: distinctId,
        body: properties ?? {},
        at: Date.now(),
      });
    },
    identify: (id: string) => {
      distinctId = id;
    },
    setPersonProperties: () => {},
    unsetPersonProperties: () => {},
    group: (type: string, key: string) => {
      groups = { ...groups, [type]: key };
    },
    getPersistedProperty: (key: string) =>
      key === "props" ? { $groups: groups } : undefined,
    register: (properties: { $groups: Record<string, string | number> }) => {
      groups = properties.$groups;

      return Promise.resolve();
    },
    reset: () => {
      distinctId = "anonymous";
      groups = {};
    },
    optIn: () => {
      collecting.set(true);

      return Promise.resolve();
    },
    optOut: () => {
      collecting.set(false);

      return Promise.resolve();
    },
    flush: () => Promise.resolve(),
  } satisfies PostHogLike;

  return { sdk, inbox: inbox.log, collecting };
};
