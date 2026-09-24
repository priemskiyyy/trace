type Properties = Record<string, unknown>;

type HeapUser = { identity: string | null; properties: Properties };

type SentEvent = { name: string; properties: Properties; user: HeapUser };

const REFUSED = [
  "undefined",
  "anonymous",
  "true",
  "false",
  "not_authenticated",
  "NaN",
  "NA",
  "Na",
  "unique_identifier",
  "0",
  "",
  '""',
  "[object Object]",
  "{{ customer.email }}",
  "{{ email }}",
  "hashed_user_id",
];

const REFUSED_IN_ANY_CASE = /^(?:email|none|unknown|guest|null)$/i;

const getBytes = (text: string) => new TextEncoder().encode(text).length;

// heap.js cuts by whole characters, counting UTF-16 code units.
const cut = (text: string, limit: number) => {
  let kept = "";

  for (const character of text) {
    if (kept.length + character.length > limit) {
      break;
    }

    kept += character;
  }

  return kept;
};

const join = (items: unknown[]) => {
  let joined = "";

  for (const item of items) {
    if (item === "") {
      continue;
    }

    const part = joined === "" ? String(item) : `||${String(item)}`;

    if (joined.length + part.length > 1024) {
      break;
    }

    joined += part;
  }

  return joined;
};

const isFlat = (value: unknown) =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

// heap.js 5.3.16's sanitizer, run over event and user properties alike.
const sanitize = (properties: Properties) =>
  Object.fromEntries(
    Object.entries(properties).flatMap(([key, value]): [string, unknown][] => {
      if (getBytes(key) > 512 || value === null || value === "") {
        return [];
      }

      if (typeof value === "string") {
        return [[key, getBytes(value) > 1024 ? cut(value, 1024) : value]];
      }

      if (typeof value === "number" || typeof value === "boolean") {
        return [[key, String(value)]];
      }

      if (Array.isArray(value) && value.every(isFlat)) {
        return [[key, join(value)]];
      }

      return [];
    }),
  );

/**
 * `window.heap` for the tests, modelled on heap.js 5.3.16 once it has loaded.
 * It keeps Heap's users: identifying an anonymous user takes that user and
 * everything it did over, identifying someone else while identified starts a
 * new user, and `resetIdentity` does nothing for a user who is anonymous.
 * `identify` ignores the identities heap.js refuses and cuts one past 255
 * characters, and `track` drops a name over 1024 bytes without a word. What it
 * records under `events` and each user's `properties` is what heap.js keeps:
 * its sanitizer drops blank and nested values and names past 512 bytes, cuts
 * text past 1024 characters, joins an array with `||`, and every value goes
 * out as text. It counts the loading, tracking and super property calls Trace
 * must never make. It proves the mapping, the identity calls and whose history
 * each event ends in; it does not model the snippet's stub, autocapture, or
 * Heap's batching, upload and server-side merges.
 */
export const fakeHeap = ({ loaded = true }: { loaded?: boolean } = {}) => {
  const first: HeapUser = { identity: null, properties: {} };
  const users: HeapUser[] = [first];
  const state: { user: HeapUser } = { user: first };
  const events: SentEvent[] = [];

  const calls: {
    track: [name: string, properties: Properties][];
    identify: string[];
    addUserProperties: Properties[];
    resetIdentity: number;
    load: number;
    init: number;
    stopTracking: number;
    startTracking: number;
    addEventProperties: number;
    clearEventProperties: number;
  } = {
    track: [],
    identify: [],
    addUserProperties: [],
    resetIdentity: 0,
    load: 0,
    init: 0,
    stopTracking: 0,
    startTracking: 0,
    addEventProperties: 0,
    clearEventProperties: 0,
  };

  const startUser = (identity: string | null) => {
    const user: HeapUser = { identity, properties: {} };

    users.push(user);
    state.user = user;
  };

  const sdk = {
    loaded,
    track: (name: string, properties: Properties) => {
      calls.track.push([name, properties]);

      if (getBytes(name) > 1024) {
        return;
      }

      events.push({ name, properties: sanitize(properties), user: state.user });
    },
    identify: (identity: string) => {
      calls.identify.push(identity);

      if (REFUSED.includes(identity) || REFUSED_IN_ANY_CASE.test(identity)) {
        return;
      }

      const kept = cut(identity, 255);

      if (state.user.identity !== null && state.user.identity !== kept) {
        startUser(kept);

        return;
      }

      state.user.identity = kept;
    },
    addUserProperties: (properties: Properties) => {
      calls.addUserProperties.push(properties);
      Object.assign(state.user.properties, sanitize(properties));
    },
    resetIdentity: () => {
      calls.resetIdentity += 1;

      if (state.user.identity !== null) {
        startUser(null);
      }
    },
    load: () => {
      calls.load += 1;
    },
    init: () => {
      calls.init += 1;
    },
    stopTracking: () => {
      calls.stopTracking += 1;
      sdk.loaded = false;
    },
    startTracking: () => {
      calls.startTracking += 1;
    },
    addEventProperties: () => {
      calls.addEventProperties += 1;
    },
    clearEventProperties: () => {
      calls.clearEventProperties += 1;
    },
  };

  return { sdk, state, users, events, calls };
};
