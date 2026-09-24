import type { PostHogOptions } from "posthog-react-native";

type Properties = Record<string, unknown>;

type Groups = Record<string, string | number>;

type FakeCall = { method: string; args: unknown[] };

type QueuedEvent = {
  event: string;
  distinct_id: string;
  properties: Properties;
  timestamp: Date | null;
  uuid: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getGroups = (value: unknown): Groups => {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(
      ([type, key]: [string, unknown]): [string, string | number][] => {
        if (typeof key !== "string" && typeof key !== "number") {
          return [];
        }

        return [[type, key]];
      },
    ),
  );
};

/**
 * A posthog-react-native 4.77.0 client on @posthog/core 1.55.1 for the tests,
 * recording every call with its arguments in order. `state` is what its
 * storage holds. Like the real client it loads that storage after it is
 * created: until `finishLoading()`, `ready()` waits, `getPersistedProperty`
 * reads nothing and every other call waits in call order, as `wrap` makes
 * them. `capture` answers nothing and queues the event under the person the
 * client holds, over its `$groups`, unless it is opted out; a `$groups`
 * property registers memberships, `$session_id` is the client's own, and a
 * `uuid` that is not a UUID is replaced. `identify` switches the person.
 * `setPersonProperties` and `unsetPersonProperties` queue a `$set` event and
 * ignore an empty update, and the first also an update identical to the last.
 * `group` adds the membership to `$groups` and queues `$groupidentify` when
 * the membership is new or has properties. Under `personProfiles: "never"`
 * those four do nothing. `register` merges into the super properties, whose
 * `$groups` `getPersistedProperty("props")` reads, and `reset` starts a new
 * anonymous person and forgets the super properties and the opt-in choice,
 * which falls back to `defaultOptIn`. `optIn`, `optOut`, `register` and
 * `flush` answer promises a test can hold, each rejecting with the error
 * `state.failures` holds for it; a failed flush keeps the queue. A time the
 * client stamps itself reads as `null`.
 *
 * It proves which calls the adapter makes, in which order, and what the client
 * would queue for them. `isDisabled` answers the `disabled` option, but what a
 * disabled client drops is not modelled, since the adapter refuses to open
 * over one; nor are feature flags, sessions, `before_send`, the native layer,
 * the storage file or PostHog's servers.
 */
export const fakePostHog = ({
  loaded = true,
  disabled = false,
  defaultOptIn = true,
  personProfiles = "identified_only",
  hold = [],
}: {
  loaded?: boolean;
  disabled?: boolean;
  defaultOptIn?: boolean;
  personProfiles?: NonNullable<PostHogOptions["personProfiles"]>;
  hold?: string[];
} = {}) => {
  const state: {
    distinctId: string | null;
    anonymousId: string | null;
    groups: Groups | null;
    optedOut: boolean | null;
    failures: Record<string, Error>;
  } = {
    distinctId: null,
    anonymousId: null,
    groups: null,
    optedOut: null,
    failures: {},
  };

  const calls: FakeCall[] = [];
  const queue: QueuedEvent[] = [];
  const sent: QueuedEvent[] = [];
  const held: Array<() => void> = [];

  let isLoaded = false;
  let anonymousCount = 0;
  let personHash: string | null = null;

  let resolveLoading = () => {};

  const loading = new Promise<void>((resolve) => {
    resolveLoading = resolve;
  });

  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
  };

  const createAnonymousId = () => {
    anonymousCount += 1;

    return `anonymous-${anonymousCount}`;
  };

  const hasPersons = () => personProfiles !== "never";

  const getDistinctId = () => state.distinctId ?? state.anonymousId ?? "";

  const wrap = (task: () => void) => {
    if (isLoaded) {
      task();

      return;
    }

    loading.then(task, () => {});
  };

  const answer = (method: string) =>
    new Promise<void>((resolve, reject) => {
      const settle = () => {
        const failure = state.failures[method];

        if (failure === undefined) {
          resolve();

          return;
        }

        reject(failure);
      };

      if (hold.includes(method)) {
        held.push(settle);

        return;
      }

      queueMicrotask(settle);
    });

  const registerGroups = (groups: Groups) => {
    if (hasPersons()) {
      state.groups = { ...state.groups, ...groups };
    }
  };

  const enqueue = (
    event: string,
    properties: Properties,
    options: { timestamp?: Date; uuid?: string } = {},
  ) => {
    if (properties.$groups) {
      registerGroups(getGroups(properties.$groups));
    }

    if (state.optedOut ?? !defaultOptIn) {
      return;
    }

    queue.push({
      event,
      distinct_id: getDistinctId(),
      properties: {
        ...(state.groups === null ? {} : { $groups: { ...state.groups } }),
        ...properties,
        $session_id: "session-1",
      },
      timestamp: options.timestamp ?? null,
      uuid:
        options.uuid !== undefined && UUID.test(options.uuid)
          ? options.uuid
          : `generated-${queue.length + 1}`,
    });
  };

  const sdk = {
    isDisabled: disabled,
    ready: async () => {
      record("ready");
      await loading;
    },
    capture: (
      event: string,
      properties: Properties = {},
      options: { timestamp?: Date; uuid?: string } = {},
    ) => {
      record("capture", event, properties, options);
      wrap(() => {
        enqueue(event, properties, options);
      });
    },
    identify: (id: string) => {
      record("identify", id);
      wrap(() => {
        const previous = getDistinctId();

        if (!hasPersons() || id === previous) {
          return;
        }

        const anonymous = state.anonymousId;

        state.anonymousId = previous;
        state.distinctId = id;
        enqueue("$identify", { $anon_distinct_id: anonymous });
      });
    },
    setPersonProperties: (properties: Properties = {}) => {
      record("setPersonProperties", properties);
      wrap(() => {
        const hash = JSON.stringify([getDistinctId(), properties]);

        if (
          !hasPersons() ||
          Object.keys(properties).length === 0 ||
          hash === personHash
        ) {
          return;
        }

        personHash = hash;
        enqueue("$set", { $set: properties, $set_once: {} });
      });
    },
    unsetPersonProperties: (names: string | string[]) => {
      record("unsetPersonProperties", names);
      wrap(() => {
        const kept = (Array.isArray(names) ? names : [names]).flatMap(
          (name) => {
            if (name.length === 0) {
              return [];
            }

            return [name];
          },
        );

        if (!hasPersons() || kept.length === 0) {
          return;
        }

        personHash = null;
        enqueue("$set", { $unset: kept });
      });
    },
    group: (type: string, key: string, properties?: Properties) => {
      record("group", type, key, properties);
      wrap(() => {
        const isNew = state.groups?.[type] !== key;

        registerGroups({ [type]: key });

        if (hasPersons() && (isNew || properties !== undefined)) {
          enqueue("$groupidentify", {
            $group_type: type,
            $group_key: key,
            $group_set: properties ?? {},
          });
        }
      });
    },
    getPersistedProperty: (key: string) => {
      record("getPersistedProperty", key);

      if (!isLoaded || key !== "props" || state.groups === null) {
        return undefined;
      }

      return { $groups: { ...state.groups } };
    },
    register: (properties: { $groups: Groups }) => {
      record("register", properties);
      wrap(() => {
        state.groups = { ...properties.$groups };
      });

      return answer("register");
    },
    reset: () => {
      record("reset");
      wrap(() => {
        state.distinctId = null;
        state.anonymousId = createAnonymousId();
        state.groups = null;
        state.optedOut = null;
        personHash = null;
      });
    },
    optIn: () => {
      record("optIn");
      wrap(() => {
        state.optedOut = false;
      });

      return answer("optIn");
    },
    optOut: () => {
      record("optOut");
      wrap(() => {
        state.optedOut = true;
      });

      return answer("optOut");
    },
    flush: async () => {
      record("flush");
      await loading;
      await answer("flush");
      sent.push(...queue.splice(0));
    },
    shutdown: async () => {
      record("shutdown");
    },
  };

  const finishLoading = () => {
    if (state.anonymousId === null) {
      state.anonymousId = createAnonymousId();
    }

    isLoaded = true;
    resolveLoading();
  };

  if (loaded) {
    finishLoading();
  }

  return { sdk, state, calls, queue, sent, held, finishLoading };
};
