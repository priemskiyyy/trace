import type {
  SegmentIdentity,
  SegmentLike,
} from "@priemskiyyy/trace-segment-node";

import type { ProviderCall } from "example-shared/simulated/types/ProviderCall";
import { createEventLog } from "example-shared/utils/createEventLog";

/** An analytics-node client, recording every track in memory instead of batching it to Segment. */
export const createSimulatedSegmentNode = () => {
  const inbox = createEventLog<ProviderCall>(20);

  const sdk = {
    track: (
      call: SegmentIdentity & {
        event: string;
        properties: Record<string, unknown>;
        timestamp: Date;
        messageId: string;
      },
    ) => {
      inbox.add({
        id: call.messageId,
        eventName: call.event,
        user: call.userId ?? call.anonymousId ?? null,
        body: call.properties,
        at: Date.now(),
      });
    },
    identify: () => {},
    group: () => {},
    flush: () => Promise.resolve(),
  } satisfies SegmentLike;

  return { sdk, inbox: inbox.log };
};
