import type { MixpanelLike } from "@priemskiyyy/trace-mixpanel";

import type { ProviderCall } from "example-shared/simulated/types/ProviderCall";
import { createEventLog } from "example-shared/utils/createEventLog";
import { createValueStore } from "example-shared/utils/createValueStore";

/** A mixpanel-browser instance in the page, one user per browser as Mixpanel holds. */
export const createSimulatedMixpanel = () => {
  const inbox = createEventLog<ProviderCall>(20);
  const collecting = createValueStore(true);
  let distinctId = "anonymous";

  const sdk = {
    __loaded: true,
    track: (name: string, properties: Record<string, unknown>) => {
      inbox.add({
        id: crypto.randomUUID(),
        eventName: name,
        user: distinctId,
        body: properties,
        at: Date.now(),
      });

      return properties;
    },
    identify: (id: string) => {
      distinctId = id;

      return undefined;
    },
    people: { set: () => {}, unset: () => {} },
    set_group: () => {},
    get_group: () => ({ set: () => {}, unset: () => {} }),
    unregister: () => {},
    reset: () => {
      distinctId = "anonymous";
    },
    opt_out_tracking: () => {
      collecting.set(false);
    },
    opt_in_tracking: (options: { track: () => void }) => {
      collecting.set(true);
      options.track();
    },
  } satisfies MixpanelLike;

  return { sdk, inbox: inbox.log, collecting };
};
