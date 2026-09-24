type Properties = Record<string, unknown>;

type Payload = { event: string; properties: Properties };

type ProfileUpdate = {
  $distinct_id: string;
  $set?: Properties;
  $unset?: string[];
  $remove?: Properties;
  $delete?: string;
};

type GroupUpdate = {
  $group_key: string;
  $group_id: string;
  $set?: Properties;
  $unset?: string[];
};

type FakeCall = { method: string; args: unknown[] };

type Persisted = { distinct_id: string; $device_id: string } & Properties;

type FakeConfig = {
  batch_requests?: boolean;
  opt_out_tracking_by_default?: boolean;
  hooks?: { before_send_events?: (payload: Payload) => Payload | null };
};

const EVENT_DEFAULTS = Object.freeze({
  $os: "Mac OS X",
  $browser: "Chrome",
  mp_lib: "web",
  $lib_version: "2.83.0",
});

const PROFILE_DEFAULTS = Object.freeze({
  $os: "Mac OS X",
  $browser: "Chrome",
  $browser_version: 140,
});

const PROFILE_RESERVED = Object.freeze([
  "$distinct_id",
  "$token",
  "$device_id",
  "$user_id",
  "$had_persisted_distinct_id",
]);

const GROUP_RESERVED = Object.freeze(["$group_key", "$group_id"]);

const truncate = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.slice(0, 255);
  }

  if (Array.isArray(value)) {
    return value.map(truncate);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, truncate(item)]),
    );
  }

  return value;
};

/**
 * mixpanel-browser for the tests, modelled on the source of version 2.83.0,
 * recording every call with its arguments. Before `init` every method throws a
 * TypeError, so only `__loaded` can be read. `track` merges the caller's
 * properties last, over the SDK's defaults and super properties, so a caller's
 * `distinct_id` or `time` wins while its `token` does not; it cuts every string
 * and the name to 255 code units, and answers the payload, nothing while opted
 * out, and in immediate mode `null` when `before_send_events` drops the event
 * or `false` when a request cannot start. People updates wait in a queue until
 * `identify` runs in this page load, every `$set` also carries the browser, and
 * people and group updates drop the names the SDK writes itself
 * (`$distinct_id`, `$token`, `$device_id`, `$user_id`,
 * `$had_persisted_distinct_id`, `$group_key`, `$group_id`) without a word.
 * `identify` refuses a `$device:` id with -1 and tracks `$identify` whenever
 * the id changes. `set_group` registers a super property and sets it on the
 * profile, and `remove_group` leaves a stray `group_key` super property.
 * `reset` forgets the user, the super properties and the queue. Opting out
 * deletes the profile and stops storing identifiers unless told otherwise, and
 * opting in tracks `$opt_in` unless it is given a `track` of its own.
 *
 * It proves which calls the adapter makes, with which arguments, and what
 * this model of the SDK does with them. It does not prove what Mixpanel's
 * servers keep, refuse or deduplicate, nor batching, uploads, `sendBeacon`,
 * cookies, Do Not Track or bot filtering, which it does not model. The
 * contracts pin its members to the real SDK's names and arity only, because
 * mixpanel-browser declares methods, whose parameters compare both ways.
 */
export const fakeMixpanel = ({
  loaded = true,
  config = {},
  storedUser,
}: { loaded?: boolean; config?: FakeConfig; storedUser?: string } = {}) => {
  let devices = 0;
  let inserts = 0;

  const createDevice = (): Persisted => {
    devices += 1;

    return {
      distinct_id: `$device:device-${devices}`,
      $device_id: `device-${devices}`,
    };
  };

  const state: {
    token: string;
    config: FakeConfig;
    persisted: Persisted;
    stored: boolean;
    identifyCalled: boolean;
    queued: { set: Properties; unset: string[] };
    optedOut: boolean;
    unsent: Payload[];
    requestFails: boolean;
  } = {
    token: "fake-token",
    config: { batch_requests: true, ...config },
    persisted:
      storedUser === undefined
        ? createDevice()
        : { ...createDevice(), distinct_id: storedUser, $user_id: storedUser },
    stored: true,
    identifyCalled: false,
    queued: { set: {}, unset: [] },
    optedOut: config.opt_out_tracking_by_default === true,
    unsent: [],
    requestFails: false,
  };

  const calls: FakeCall[] = [];
  const events: Payload[] = [];
  const profileUpdates: ProfileUpdate[] = [];
  const groupUpdates: GroupUpdate[] = [];

  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
  };

  const assertLoaded = () => {
    if (!sdk.__loaded) {
      throw new TypeError(
        "Cannot read properties of undefined (reading 'token')",
      );
    }
  };

  const capture = (
    name: string,
    properties: Properties,
  ): Payload | null | false | undefined => {
    if (state.optedOut) {
      return undefined;
    }

    inserts += 1;

    const merged: Properties = {
      ...EVENT_DEFAULTS,
      $insert_id: `insert-${inserts}`,
      time: Date.now() / 1000,
      ...state.persisted,
      ...properties,
      token: state.token,
    };

    const payload: Payload = {
      event: name.slice(0, 255),
      properties: Object.fromEntries(
        Object.entries(merged).map(([key, value]) => [key, truncate(value)]),
      ),
    };

    if (state.config.batch_requests !== false) {
      state.unsent.push(payload);
      events.push(payload);

      return payload;
    }

    const beforeSend = state.config.hooks?.before_send_events;
    const sent = beforeSend === undefined ? payload : beforeSend(payload);

    if (sent === null) {
      return null;
    }

    if (state.requestFails) {
      return false;
    }

    events.push(sent);

    return sent;
  };

  const sendProfile = (update: Omit<ProfileUpdate, "$distinct_id">) => {
    profileUpdates.push({
      $distinct_id: state.persisted.distinct_id,
      ...update,
    });
  };

  const setProfile = (properties: Properties) => {
    if (!state.identifyCalled) {
      Object.assign(state.queued.set, properties);
      state.queued.unset = state.queued.unset.filter(
        (name) => !Object.hasOwn(properties, name),
      );

      return;
    }

    sendProfile({ $set: { ...PROFILE_DEFAULTS, ...properties } });
  };

  const unsetProfile = (names: string[]) => {
    if (!state.identifyCalled) {
      for (const name of names) {
        delete state.queued.set[name];
      }

      state.queued.unset = [...new Set([...state.queued.unset, ...names])];

      return;
    }

    sendProfile({ $unset: names });
  };

  const sdk = {
    __loaded: loaded,
    init: (token: string, next: FakeConfig = {}) => {
      record("init", token, next);
      state.token = token;
      state.config = { ...state.config, ...next };

      if (next.opt_out_tracking_by_default === true) {
        state.optedOut = true;
      }

      sdk.__loaded = true;

      return undefined;
    },
    set_config: (next: FakeConfig) => {
      record("set_config", next);
      assertLoaded();
      state.config = { ...state.config, ...next };
    },
    track: (name: string, properties: Properties = {}) => {
      record("track", name, properties);
      assertLoaded();

      return capture(name, properties);
    },
    identify: (id: string) => {
      record("identify", id);
      assertLoaded();

      const previous = state.persisted.distinct_id;

      if (id !== previous && id.startsWith("$device:")) {
        return -1;
      }

      if (id !== previous) {
        state.persisted.$user_id = id;
        state.persisted.distinct_id = id;
      }

      state.identifyCalled = true;

      const { set, unset } = state.queued;

      state.queued = { set: {}, unset: [] };

      if (!state.optedOut && Object.keys(set).length > 0) {
        sendProfile({ $set: { ...PROFILE_DEFAULTS, ...set } });
      }

      if (!state.optedOut && unset.length > 0) {
        sendProfile({ $unset: unset });
      }

      if (id !== previous) {
        capture("$identify", { distinct_id: id, $anon_distinct_id: previous });
      }

      return undefined;
    },
    register: (properties: Properties) => {
      record("register", properties);
      assertLoaded();
      Object.assign(state.persisted, properties);
    },
    unregister: (name: string) => {
      record("unregister", name);
      assertLoaded();
      delete state.persisted[name];
    },
    people: {
      set: (properties: Properties) => {
        record("people.set", properties);
        assertLoaded();

        if (!state.optedOut) {
          setProfile(
            Object.fromEntries(
              Object.entries(properties).filter(
                ([name]) => !PROFILE_RESERVED.includes(name),
              ),
            ),
          );
        }
      },
      unset: (names: string[]) => {
        record("people.unset", names);
        assertLoaded();

        if (!state.optedOut) {
          unsetProfile(
            names.filter((name) => !PROFILE_RESERVED.includes(name)),
          );
        }
      },
    },
    set_group: (type: string, id: string) => {
      record("set_group", type, id);
      assertLoaded();

      if (state.optedOut) {
        return;
      }

      state.persisted[type] = [id];
      setProfile({ [type]: [id] });
    },
    remove_group: (type: string, id: string) => {
      record("remove_group", type, id);
      assertLoaded();

      if (state.optedOut) {
        return;
      }

      const held = state.persisted[type];

      if (Array.isArray(held) && held.includes(id)) {
        held.splice(held.indexOf(id), 1);
        state.persisted.group_key = held;
      }

      if (Array.isArray(held) && held.length === 0) {
        delete state.persisted[type];
      }

      if (state.identifyCalled) {
        sendProfile({ $remove: { [type]: id } });
      }
    },
    get_group: (type: string, id: string) => {
      record("get_group", type, id);
      assertLoaded();

      return {
        set: (properties: Properties) => {
          record("group.set", properties);

          if (!state.optedOut) {
            groupUpdates.push({
              $group_key: type,
              $group_id: id,
              $set: Object.fromEntries(
                Object.entries(properties).filter(
                  ([name]) => !GROUP_RESERVED.includes(name),
                ),
              ),
            });
          }
        },
        unset: (name: string) => {
          record("group.unset", name);

          if (!state.optedOut) {
            groupUpdates.push({
              $group_key: type,
              $group_id: id,
              $unset: GROUP_RESERVED.includes(name) ? [] : [name],
            });
          }
        },
      };
    },
    reset: () => {
      record("reset");
      assertLoaded();
      state.persisted = createDevice();
      state.queued = { set: {}, unset: [] };
      state.identifyCalled = false;
    },
    opt_out_tracking: (
      options: { delete_user?: boolean; clear_persistence?: boolean } = {},
    ) => {
      record("opt_out_tracking", options);
      assertLoaded();

      const { delete_user = true, clear_persistence = true } = options;

      if (delete_user && state.identifyCalled) {
        sendProfile({ $delete: state.persisted.distinct_id });
        sendProfile({ $set: { ...PROFILE_DEFAULTS, $transactions: [] } });
      }

      state.optedOut = true;

      if (clear_persistence) {
        state.stored = false;
        state.unsent = [];
      }
    },
    opt_in_tracking: (
      options: { track?: () => void; enable_persistence?: boolean } = {},
    ) => {
      record("opt_in_tracking", options);
      assertLoaded();

      const { track, enable_persistence = true } = options;

      state.optedOut = false;

      if (track === undefined) {
        capture("$opt_in", {});
      } else {
        track();
      }

      if (enable_persistence) {
        state.stored = true;
      }
    },
  };

  return { sdk, state, calls, events, profileUpdates, groupUpdates };
};
