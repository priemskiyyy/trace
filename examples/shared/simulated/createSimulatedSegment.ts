import type { SegmentLike } from "@priemskiyyy/trace-segment";

import type { ProviderCall } from "example-shared/simulated/types/ProviderCall";
import { createEventLog } from "example-shared/utils/createEventLog";
import { createValueStore } from "example-shared/utils/createValueStore";

/**
 * The analytics-next instance in the page. `ready` starts false, as a load
 * that has not finished yet: the lab turns it on, then `trace.start()`
 * retries the destinations that failed to open.
 */
export const createSimulatedSegment = () => {
  const inbox = createEventLog<ProviderCall>(20);
  const ready = createValueStore(false);
  const group = createValueStore<string | null>(null);
  let userId: string | null = null;

  const sdk = {
    get initialized() {
      return ready.get();
    },
    track: (
      name: string,
      properties: Record<string, unknown>,
      options: { timestamp: Date; messageId: string },
    ) => {
      inbox.add({
        id: options.messageId,
        eventName: name,
        user: userId,
        body: properties,
        at: Date.now(),
      });

      return Promise.resolve();
    },
    identify: (idOrTraits: string | Record<string, unknown>) => {
      if (typeof idOrTraits === "string") {
        userId = idOrTraits;
      }

      return Promise.resolve();
    },
    group: (id: string) => {
      group.set(id);

      return Promise.resolve();
    },
    reset: () => {
      userId = null;
      group.set(null);
    },
  } satisfies SegmentLike;

  return {
    sdk,
    inbox: inbox.log,
    ready,
    group,
    setReady: (value: boolean) => {
      ready.set(value);
    },
  };
};
