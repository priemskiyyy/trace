type Properties = Record<string, unknown>;

type Payload = { event: string; properties: Properties };

type FakeCall = { method: string; args: unknown[] };

const isBlank = (value: unknown) =>
  typeof value !== "string" || /^\s*$/.test(value);

/**
 * A mixpanel-react-native 3.8.0 `Mixpanel` for the tests, modelled on its
 * JavaScript wrapper (index.js) over a native module that applies calls in
 * the order it receives them, recording every call with its arguments. `track`
 * throws at once on a blank name and answers nothing, also while opted out,
 * when it keeps nothing; the event it keeps carries the super properties and
 * the caller's properties over the distinct id held at the call. `identify`
 * switches the user and answers a promise that settles on a later microtask
 * or, with `hold`, when the test releases it, and rejects a blank id; the id
 * it already holds changes nothing. `getPeople()` answers the People whose
 * `unset` takes one name and throws on a blank one. `setGroup` registers the
 * membership as a super property and sets it on the profile. `reset` answers
 * nothing and starts a new device, with no user and no super properties.
 *
 * It proves which calls the adapter makes, in which order and with which
 * arguments, and what this model does with them. It does not model
 * JavaScript mode's storage or its reset race, `getGroup`, which the adapter
 * never calls, the native SDKs' queues, uploads or opt-out, nor what
 * Mixpanel's servers keep. The contracts pin its members to the real SDK's
 * names and types, which mixpanel-react-native declares as methods, so their
 * parameters compare both ways.
 */
export const fakeMixpanel = ({ hold = false }: { hold?: boolean } = {}) => {
  let devices = 1;

  const state: {
    distinctId: string;
    superProperties: Properties;
    profile: Properties;
    optedOut: boolean;
  } = {
    distinctId: "$device:device-1",
    superProperties: {},
    profile: {},
    optedOut: false,
  };

  const calls: FakeCall[] = [];
  const events: Payload[] = [];
  const held: Array<() => void> = [];

  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
  };

  const setProfile = (properties: Properties) => {
    if (!state.optedOut) {
      Object.assign(state.profile, JSON.parse(JSON.stringify(properties)));
    }
  };

  const people = {
    set: (properties: Properties) => {
      record("people.set", properties);
      setProfile(properties);
    },
    unset: (name: string) => {
      record("people.unset", name);

      if (isBlank(name)) {
        throw new Error("propertyName is not a valid string");
      }

      delete state.profile[name];
    },
  };

  const sdk = {
    init: (optOutTrackingDefault = false) => {
      record("init", optOutTrackingDefault);
      state.optedOut = optOutTrackingDefault;

      return Promise.resolve();
    },
    track: (name: string, properties: Properties = {}) => {
      record("track", name, properties);

      if (isBlank(name)) {
        throw new Error("eventName is not a valid string");
      }

      if (state.optedOut) {
        return;
      }

      events.push({
        event: name,
        properties: {
          distinct_id: state.distinctId,
          ...state.superProperties,
          ...properties,
        },
      });
    },
    identify: (id: string) => {
      record("identify", id);

      return new Promise<void>((resolve, reject) => {
        if (isBlank(id)) {
          reject(new Error("distinctId is not a valid string"));

          return;
        }

        state.distinctId = id;

        if (hold) {
          held.push(resolve);

          return;
        }

        queueMicrotask(resolve);
      });
    },
    getPeople: () => people,
    setGroup: (type: string, id: string) => {
      record("setGroup", type, id);
      state.superProperties[type] = [id];
      setProfile({ [type]: [id] });
    },
    unregisterSuperProperty: (name: string) => {
      record("unregisterSuperProperty", name);
      delete state.superProperties[name];
    },
    reset: () => {
      record("reset");
      devices += 1;
      state.distinctId = `$device:device-${devices}`;
      state.superProperties = {};
    },
    optInTracking: () => {
      record("optInTracking");
      state.optedOut = false;
    },
    optOutTracking: () => {
      record("optOutTracking");
      state.optedOut = true;
    },
    flush: () => {
      record("flush");
    },
  };

  return { sdk, state, calls, events, held };
};
