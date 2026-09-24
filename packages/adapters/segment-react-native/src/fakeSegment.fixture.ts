type Traits = Record<string, unknown>;

type FakeCall = { method: string; args: unknown[] };

type Stamp = {
  messageId: string;
  timestamp: string;
  userId: string | undefined;
  anonymousId: string;
};

type TrackEvent = { type: "track"; event: string; properties: Traits } & Stamp;

type Enrichment = <TEvent extends { messageId?: string; timestamp?: string }>(
  event: TEvent,
) => TEvent;

type FakeSegmentEvent =
  | TrackEvent
  | ({ type: "identify"; traits: Traits } & Stamp)
  | ({ type: "group"; groupId: string; traits: Traits } & Stamp);

/**
 * An analytics-react-native 2.24.1 `SegmentClient` for the tests, recording
 * every call with its arguments in order. While it is ready and running it
 * processes `track`, `identify` and `group` at the call: it stamps each event
 * with a message id and time of its own and with the user and anonymous id it
 * holds then, a track's enrichment then answers the event that joins the
 * upload queue in place of that stamp, and `identify` holds its user, or
 * keeps the one it holds for `undefined`, and merges its traits into those it
 * keeps. Until then, and while `pauseEventProcessing` has paused it, it holds
 * those calls and processes them in order, with whoever it holds by then,
 * once `resumeEventProcessing` has turned `running` on and called its
 * listeners, as the real one does when `init` ends and when a plugin that
 * paused it resumes. `reset` forgets the user and the traits and starts a
 * new anonymous id a microtask after the call, even while calls are held, as
 * the real one writes its store only after it has read it. `enabled.set`
 * takes effect a microtask after the call, as the real store applies it, and
 * while `enabled` is `false` the client drops `track`, `identify` and `group`
 * at the call. Every call answers a promise that settles on a later microtask
 * or, for a method `hold` names, when the test releases it; `track`,
 * `identify` and `group` reject with the error `state.failures` holds for
 * them, while `reset`, `enabled.set` and `flush` never reject, as the real
 * ones do not. `flush` uploads the queue, or keeps all of it while
 * `state.offline`, and `pendingEvents` counts what is queued.
 *
 * It proves which calls the adapter makes, in which order, and whom the client
 * files each event under. It works through the calls it held before any later
 * call, where the real one does so asynchronously and a later call can
 * overtake them, and it does not model plugins, settings, retries or
 * Segment's servers.
 */
export const fakeSegment = ({
  ready = true,
  running = true,
  hold = [],
}: { ready?: boolean; running?: boolean; hold?: string[] } = {}) => {
  const state: {
    userId: string | undefined;
    anonymousId: string;
    traits: Traits;
    enabled: boolean;
    running: boolean;
    offline: boolean;
    failures: Record<string, Error>;
  } = {
    userId: undefined,
    anonymousId: "anonymous-1",
    traits: {},
    enabled: true,
    running,
    offline: false,
    failures: {},
  };

  const isReady = { value: ready };
  const calls: FakeCall[] = [];
  const queue: FakeSegmentEvent[] = [];
  const sent: FakeSegmentEvent[] = [];
  const held: Array<() => void> = [];
  const pending: Array<() => void> = [];
  const listeners = new Set<(running: boolean) => void>();

  let anonymousCount = 1;
  let messageCount = 0;

  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
  };

  const wait = (method: string) =>
    new Promise<void>((resolve) => {
      if (hold.includes(method)) {
        held.push(resolve);

        return;
      }

      queueMicrotask(resolve);
    });

  const answer = async (method: string) => {
    await wait(method);

    const failure = state.failures[method];

    if (failure !== undefined) {
      throw failure;
    }
  };

  const stamp = (): Stamp => {
    messageCount += 1;

    return {
      messageId: `message-${messageCount}`,
      timestamp: "2026-09-24T00:00:00.000Z",
      userId: state.userId,
      anonymousId: state.anonymousId,
    };
  };

  const processCall = (apply: () => void) => {
    if (!state.enabled) {
      return;
    }

    if (isReady.value && state.running) {
      apply();

      return;
    }

    pending.push(apply);
  };

  const setRunning = (value: boolean) => {
    state.running = value;
    listeners.forEach((listener) => {
      listener(value);
    });
  };

  const sdk = {
    isReady,
    running: {
      get: () => state.running,
      onChange: (callback: (value: boolean) => void) => {
        listeners.add(callback);

        return () => {
          listeners.delete(callback);
        };
      },
    },
    enabled: {
      set: (value: boolean | ((enabled: boolean) => boolean)) => {
        const enabled =
          typeof value === "function" ? value(state.enabled) : value;

        record("enabled.set", enabled);
        queueMicrotask(() => {
          state.enabled = enabled;
        });

        return wait("enabled.set").then(() => enabled);
      },
    },
    track: (
      ...args: [name: string, properties?: Traits, enrichment?: Enrichment]
    ) => {
      const [name, properties = {}, enrichment] = args;

      record("track", ...args);
      processCall(() => {
        const stamped: TrackEvent = {
          type: "track",
          event: name,
          properties,
          ...stamp(),
        };

        queue.push(enrichment === undefined ? stamped : enrichment(stamped));
      });

      return answer("track");
    },
    identify: (...args: [userId?: string, traits?: Traits]) => {
      const [userId, traits = {}] = args;

      record("identify", ...args);
      processCall(() => {
        state.userId = userId ?? state.userId;
        state.traits = { ...state.traits, ...traits };
        queue.push({
          type: "identify",
          traits: { ...state.traits },
          ...stamp(),
        });
      });

      return answer("identify");
    },
    group: (...args: [groupId: string, traits?: Traits]) => {
      const [groupId, traits = {}] = args;

      record("group", ...args);
      processCall(() => {
        queue.push({ type: "group", groupId, traits, ...stamp() });
      });

      return answer("group");
    },
    reset: (...args: [resetAnonymousId?: boolean]) => {
      record("reset", ...args);
      queueMicrotask(() => {
        if (args[0] !== false) {
          anonymousCount += 1;
          state.anonymousId = `anonymous-${anonymousCount}`;
        }

        state.userId = undefined;
        state.traits = {};
      });

      return wait("reset");
    },
    flush: async () => {
      record("flush");
      await wait("flush");

      if (!state.offline) {
        sent.push(...queue.splice(0));
      }
    },
    pendingEvents: async () => {
      record("pendingEvents");

      return queue.length;
    },
    pauseEventProcessing: () => {
      record("pauseEventProcessing");
      setRunning(false);
    },
    resumeEventProcessing: async () => {
      record("resumeEventProcessing");

      if (state.running) {
        return;
      }

      setRunning(true);

      if (isReady.value) {
        pending.splice(0).forEach((apply) => {
          apply();
        });
      }
    },
    init: async () => {
      record("init");
    },
    cleanup: () => {
      record("cleanup");
    },
  };

  return { sdk, state, calls, queue, sent, held };
};
