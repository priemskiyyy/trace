import type { PostHogLike } from "@priemskiyyy/trace-posthog-node";

import type { ProviderCall } from "example-shared/simulated/types/ProviderCall";
import { createEventLog } from "example-shared/utils/createEventLog";

/** A posthog-node client, recording every capture in memory instead of batching it to PostHog's servers. */
export const createSimulatedPostHogNode = () => {
  const inbox = createEventLog<ProviderCall>(20);

  const sdk = {
    capture: (message: {
      distinctId: string;
      event: string;
      properties: Record<string, unknown>;
      groups: Record<string, string>;
      timestamp: Date;
      uuid: string;
    }) => {
      inbox.add({
        id: message.uuid,
        eventName: message.event,
        user: message.distinctId,
        body: message.properties,
        at: Date.now(),
      });
    },
    identify: () => {},
    setPersonProperties: () => {},
    unsetPersonProperties: () => {},
    groupIdentify: () => {},
    flush: () => Promise.resolve(),
  } satisfies PostHogLike;

  return { sdk, inbox: inbox.log };
};
