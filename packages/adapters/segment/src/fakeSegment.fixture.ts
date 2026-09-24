type Traits = Record<string, unknown>;

type FakeSegmentEvent =
  | {
      type: "track";
      event: string;
      properties: Traits;
      userId: string | null;
      anonymousId: string;
      messageId: string;
      timestamp: Date;
    }
  | {
      type: "identify";
      userId: string | null;
      anonymousId: string;
      traits: Traits;
    }
  | {
      type: "group";
      groupId: string;
      traits: Traits;
      userId: string | null;
      anonymousId: string;
    };

/**
 * The `Analytics` of analytics-next 1.84.3 that `AnalyticsBrowser.load`
 * resolves with, for the tests. Like the real one it stamps each event at the
 * call with its anonymous id and, when it holds one, its user, and keeps the
 * caller's `messageId` and `timestamp`. It sends only when the test calls
 * `send()`, and then, as analytics-next's Segment.io plugin does at every
 * attempt, it gives an event without a user the user it holds by then.
 * `identify` and `group` apply at once: traits merge under the same id, and a
 * new user replaces them and starts a new anonymous id, as a new group
 * replaces its traits. `reset` forgets all of it. Every call answers a
 * promise, rejected while `state.failure` is set, as analytics-next rejects a
 * call it refuses, and nothing else observes that promise. `calls` records
 * every call in order with its arguments. It proves what the adapter hands
 * analytics-next, what analytics-next holds afterwards and whom it sends each
 * event as; it does not model plugins, retries, the offline buffer, `disable`
 * or the network, and `segment.sdk.test.ts` runs the real SDK for retries and
 * requests.
 */
export const fakeSegment = ({
  initialized = true,
}: { initialized?: boolean } = {}) => {
  const state: {
    userId: string | null;
    anonymousId: string | null;
    traits: Traits;
    groupId: string | null;
    groupTraits: Traits;
    failure: Error | null;
  } = {
    userId: null,
    anonymousId: null,
    traits: {},
    groupId: null,
    groupTraits: {},
    failure: null,
  };

  const calls: [method: string, ...parameters: unknown[]][] = [];
  const events: FakeSegmentEvent[] = [];

  const pending: {
    event: FakeSegmentEvent;
    resolve: (answer: { event: FakeSegmentEvent }) => void;
  }[] = [];

  let anonymousCount = 0;

  const getAnonymousId = () => {
    if (state.anonymousId === null) {
      anonymousCount += 1;
      state.anonymousId = `anonymous-${anonymousCount}`;
    }

    return state.anonymousId;
  };

  const dispatch = (event: FakeSegmentEvent) => {
    if (state.failure !== null) {
      return Promise.reject(state.failure);
    }

    return new Promise<{ event: FakeSegmentEvent }>((resolve) => {
      pending.push({ event, resolve });
    });
  };

  const send = () => {
    for (const { event, resolve } of pending.splice(0)) {
      // analytics-next's Segment.io plugin gives an event without a user the one it holds when it sends it.
      const sent = { ...event, userId: event.userId || state.userId };

      events.push(sent);
      resolve({ event: sent });
    }
  };

  const sdk = {
    initialized,
    track: (
      name: string,
      properties: Traits,
      options: { timestamp: Date; messageId: string },
    ) => {
      calls.push(["track", name, properties, options]);

      return dispatch({
        type: "track",
        event: name,
        properties,
        userId: state.userId,
        anonymousId: getAnonymousId(),
        messageId: options.messageId,
        timestamp: options.timestamp,
      });
    },
    identify: (idOrTraits: string | Traits) => {
      calls.push(["identify", idOrTraits]);

      const id = typeof idOrTraits === "string" ? idOrTraits : state.userId;
      const traits = typeof idOrTraits === "string" ? {} : idOrTraits;
      const isNextUser = state.userId !== null && id !== state.userId;

      state.traits = isNextUser
        ? { ...traits }
        : { ...state.traits, ...traits };

      if (isNextUser) {
        state.anonymousId = null;
      }

      state.userId = id;

      return dispatch({
        type: "identify",
        userId: state.userId,
        anonymousId: getAnonymousId(),
        traits: { ...state.traits },
      });
    },
    group: (id: string, traits: Traits) => {
      calls.push(["group", id, traits]);

      const isNextGroup = state.groupId !== null && id !== state.groupId;

      state.groupTraits = isNextGroup
        ? { ...traits }
        : { ...state.groupTraits, ...traits };
      state.groupId = id;

      return dispatch({
        type: "group",
        groupId: id,
        traits: { ...state.groupTraits },
        userId: state.userId,
        anonymousId: getAnonymousId(),
      });
    },
    reset: () => {
      calls.push(["reset"]);
      state.userId = null;
      state.anonymousId = null;
      state.traits = {};
      state.groupId = null;
      state.groupTraits = {};
    },
    init: () => {
      calls.push(["init"]);

      return Promise.resolve();
    },
    initialize: () => {
      calls.push(["initialize"]);

      return Promise.resolve();
    },
  };

  return { sdk, state, calls, events, send };
};
