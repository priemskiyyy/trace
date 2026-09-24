import type { PostHogLike } from "@priemskiyyy/trace-posthog";

import type { ProviderCall } from "example-shared/simulated/types/ProviderCall";
import { createEventLog } from "example-shared/utils/createEventLog";
import { createValueStore } from "example-shared/utils/createValueStore";

/**
 * A posthog-js instance in the page. Its own filters, toggled by the lab,
 * drop every event it captures, the way a real project's filters would.
 */
export const createSimulatedPostHog = () => {
  const inbox = createEventLog<ProviderCall>(20);
  const filtering = createValueStore(false);
  const collecting = createValueStore(true);
  let distinctId = "anonymous";
  let groups: Record<string, unknown> = {};

  const sdk = {
    __loaded: true,
    config: { properties_string_max_length: 65_535 },
    capture: (
      event: string,
      properties: Record<string, unknown>,
      options: { timestamp: Date; uuid: string },
    ) => {
      if (filtering.get()) {
        return undefined;
      }

      inbox.add({
        id: options.uuid,
        eventName: event,
        user: distinctId,
        body: properties,
        at: Date.now(),
      });

      return { uuid: options.uuid };
    },
    identify: (id: string) => {
      distinctId = id;
    },
    setPersonProperties: () => {},
    unsetPersonProperties: () => {},
    group: (type: string, key: string) => {
      groups = { ...groups, [type]: key };
    },
    getGroups: () => groups,
    register: (properties: { $groups: Record<string, unknown> }) => {
      groups = properties.$groups;
    },
    reset: () => {
      distinctId = "anonymous";
      groups = {};
    },
    opt_in_capturing: () => {
      collecting.set(true);
    },
    opt_out_capturing: () => {
      collecting.set(false);
    },
  } satisfies PostHogLike;

  return { sdk, inbox: inbox.log, filtering, collecting };
};
