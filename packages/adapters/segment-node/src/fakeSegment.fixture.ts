import type { SegmentIdentity } from "src/types/SegmentIdentity";

type Traits = Record<string, unknown>;

type FakeSegmentEvent = SegmentIdentity &
  (
    | {
        type: "track";
        event: string;
        properties: Traits;
        timestamp: Date;
        messageId: string;
      }
    | { type: "identify"; traits: Traits }
    | { type: "group"; groupId: string; traits: Traits }
  );

const assertIdentity = ({
  userId,
  anonymousId,
}: {
  userId?: string;
  anonymousId?: string;
}) => {
  if (typeof (userId ?? anonymousId) !== "string") {
    throw new Error(".userId/anonymousId/previousId/groupId is nil");
  }
};

/**
 * The `Analytics` client of @segment/analytics-node 3.1.0, for the tests. Like
 * the real one it takes the ids on every call and holds no user between calls,
 * throws when a `track` or `identify` carries neither id (a `group` passes its
 * check on the group id alone), and queues every call until the test calls
 * `send()`, which delivers the queue as one batch. `flush()` resolves once the
 * queue has been sent, at once when it is empty, and at once, counting a
 * warning, while an earlier flush still runs. After `closeAndFlush()` every
 * call is dropped. `calls` records every call in order with its arguments,
 * lifecycle calls included. It proves what the adapter hands analytics-node
 * and when a flush settles; it does not model plugins, retries, the batch
 * size, the flush interval, `disable` or the network, and
 * `segment.sdk.test.ts` runs the real SDK for those.
 */
export const fakeSegment = () => {
  const state = { flushing: false, closed: false, warnings: 0 };

  const calls: [method: string, ...parameters: unknown[]][] = [];
  const queued: FakeSegmentEvent[] = [];
  const sent: FakeSegmentEvent[] = [];
  const dropped: FakeSegmentEvent[] = [];
  const drains: (() => void)[] = [];

  const dispatch = (event: FakeSegmentEvent) => {
    if (state.closed) {
      dropped.push(event);

      return;
    }

    queued.push(event);
  };

  const send = () => {
    sent.push(...queued.splice(0));

    for (const handleDrained of drains.splice(0)) {
      handleDrained();
    }
  };

  const flush = () => {
    calls.push(["flush"]);

    if (state.flushing) {
      state.warnings += 1;

      return Promise.resolve();
    }

    state.flushing = true;

    return new Promise<void>((resolve) => {
      const handleDrained = () => {
        state.flushing = false;
        resolve();
      };

      if (queued.length === 0) {
        handleDrained();

        return;
      }

      drains.push(handleDrained);
    });
  };

  const sdk = {
    track: (
      call: SegmentIdentity & {
        event: string;
        properties: Traits;
        timestamp: Date;
        messageId: string;
      },
    ) => {
      calls.push(["track", call]);
      assertIdentity(call);
      dispatch({ ...call, type: "track" });
    },
    identify: (call: SegmentIdentity & { traits: Traits }) => {
      calls.push(["identify", call]);
      assertIdentity(call);
      dispatch({ ...call, type: "identify" });
    },
    group: (call: SegmentIdentity & { groupId: string; traits: Traits }) => {
      calls.push(["group", call]);
      dispatch({ ...call, type: "group" });
    },
    flush,
    closeAndFlush: () => {
      calls.push(["closeAndFlush"]);
      state.closed = true;

      return Promise.resolve();
    },
    register: () => {
      calls.push(["register"]);

      return Promise.resolve();
    },
  };

  return { sdk, state, calls, queued, sent, dropped, send };
};
