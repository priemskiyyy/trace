type Properties = Record<string, unknown>;

type Callback = (error: Error | undefined) => void;

type FakeRequest = { endpoint: string; data: Properties };

const TOKEN = "mixpanel-test-token";
const LIBRARY_VERSION = "0.24.0";

/**
 * The client of mixpanel 0.24.0 for Node that `Mixpanel.init` returns, for
 * the tests. Like the real one it holds no user, sends every call as one
 * request and answers each through its callback: with nothing once Mixpanel
 * accepted it, and with an error otherwise. It writes its token, library and
 * version into the object `track` is given and rewrites its `time`, throwing
 * for a `time` that is not a Date or a number, and it moves an `ip` and an
 * `$ignore_time` key out of the object a profile or group update is given; on
 * a frozen object those writes fail without a word, as in the SDK's sloppy
 * mode, so the token never reaches the request and Mixpanel refuses it.
 * Requests are answered on the next microtask, or held while `state.holding`
 * until `release(count)` answers the oldest of them, holding no more once none
 * is left, or `releaseNewestFirst()` answers them all, the newest first, and
 * holds on; `state.failure` makes Mixpanel refuse what it answers. `calls`
 * records what the adapter handed over, in order and without the callbacks,
 * `requests` what reached Mixpanel. It proves the adapter's calls, the
 * mutations it must survive and when each request settles; it does not model
 * the network, the query string or Mixpanel's own validation, and
 * `mixpanel.sdk.test.ts` runs the real client against a local server.
 */
export const fakeMixpanel = () => {
  const state: { holding: boolean; failure: Error | null } = {
    holding: false,
    failure: null,
  };

  const calls: { method: string; args: unknown[] }[] = [];
  const requests: FakeRequest[] = [];
  const held: (() => void)[] = [];

  const send = (request: FakeRequest, callback: Callback, isValid = true) => {
    requests.push(structuredClone(request));

    const answer = () => {
      if (state.failure !== null) {
        callback(state.failure);

        return;
      }

      callback(isValid ? undefined : new Error("Mixpanel Server Error: 0"));
    };

    if (state.holding) {
      held.push(answer);

      return;
    }

    queueMicrotask(answer);
  };

  const takeProfileKeys = (properties: Properties, data: Properties) => {
    if ("ip" in properties) {
      data["$ip"] = properties["ip"];
      Reflect.deleteProperty(properties, "ip");
    }

    if (properties["$ignore_time"]) {
      data["$ignore_time"] = properties["$ignore_time"];
      Reflect.deleteProperty(properties, "$ignore_time");
    }
  };

  const release = (count = held.length) => {
    for (const answer of held.splice(0, count)) {
      answer();
    }

    if (held.length === 0) {
      state.holding = false;
    }
  };

  const releaseNewestFirst = () => {
    for (const answer of held.splice(0).reverse()) {
      answer();
    }
  };

  const sdk = {
    track: (name: string, properties: Properties, callback: Callback) => {
      calls.push({
        method: "track",
        args: [name, structuredClone(properties)],
      });

      const { time } = properties;

      if (time && !(time instanceof Date || typeof time === "number")) {
        throw new Error(
          "`time` property must be a Date or Unix timestamp and is only required for `import` endpoint",
        );
      }

      if (time instanceof Date) {
        Reflect.set(properties, "time", time.getTime());
      }

      Reflect.set(properties, "token", TOKEN);
      Reflect.set(properties, "mp_lib", "node");
      Reflect.set(properties, "$lib_version", LIBRARY_VERSION);
      send(
        { endpoint: "/track", data: { event: name, properties } },
        callback,
        properties["token"] === TOKEN,
      );
    },
    people: {
      set: (distinctId: string, properties: Properties, callback: Callback) => {
        calls.push({
          method: "people.set",
          args: [distinctId, structuredClone(properties)],
        });

        const data: Properties = {
          $token: TOKEN,
          $distinct_id: distinctId,
          $set: properties,
        };

        takeProfileKeys(properties, data);
        send({ endpoint: "/engage", data }, callback);
      },
      unset: (distinctId: string, names: string[], callback: Callback) => {
        calls.push({ method: "people.unset", args: [distinctId, [...names]] });
        send(
          {
            endpoint: "/engage",
            data: { $unset: names, $token: TOKEN, $distinct_id: distinctId },
          },
          callback,
        );
      },
    },
    groups: {
      set: (
        key: string,
        id: string,
        properties: Properties,
        callback: Callback,
      ) => {
        calls.push({
          method: "groups.set",
          args: [key, id, structuredClone(properties)],
        });

        const data: Properties = {
          $token: TOKEN,
          $group_key: key,
          $group_id: id,
          $set: properties,
        };

        takeProfileKeys(properties, data);
        send({ endpoint: "/groups", data }, callback);
      },
      unset: (key: string, id: string, names: string[], callback: Callback) => {
        calls.push({ method: "groups.unset", args: [key, id, [...names]] });
        send(
          {
            endpoint: "/groups",
            data: {
              $unset: names,
              $token: TOKEN,
              $group_key: key,
              $group_id: id,
            },
          },
          callback,
        );
      },
    },
    init: (token: string) => {
      calls.push({ method: "init", args: [token] });
    },
  };

  return { sdk, state, calls, requests, release, releaseNewestFirst };
};
