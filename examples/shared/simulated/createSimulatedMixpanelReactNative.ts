import type { MixpanelLike } from "@priemskiyyy/trace-mixpanel-react-native";

import type { ProviderCall } from "example-shared/simulated/types/ProviderCall";
import { createEventLog } from "example-shared/utils/createEventLog";

/** A mixpanel-react-native instance, already initialized, recording every track in memory. */
export const createSimulatedMixpanelReactNative = () => {
  const inbox = createEventLog<ProviderCall>(20);
  let distinctId = "anonymous";
  let groups: Record<string, string> = {};

  const sdk = {
    track: (name: string, properties: Record<string, unknown>) => {
      inbox.add({
        id: crypto.randomUUID(),
        eventName: name,
        user: distinctId,
        body: properties,
        at: Date.now(),
      });
    },
    identify: (id: string) => {
      distinctId = id;

      return Promise.resolve();
    },
    getPeople: () => ({
      set: () => {},
      unset: () => {},
    }),
    setGroup: (type: string, id: string) => {
      groups = { ...groups, [type]: id };
    },
    unregisterSuperProperty: (name: string) => {
      groups = Object.fromEntries(
        Object.entries(groups).filter(([type]) => type !== name),
      );
    },
    reset: () => {
      distinctId = "anonymous";
      groups = {};
    },
  } satisfies MixpanelLike;

  return { sdk, inbox: inbox.log };
};
