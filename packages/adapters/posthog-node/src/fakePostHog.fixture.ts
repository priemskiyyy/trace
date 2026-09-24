import type {
  EventMessage,
  GroupIdentifyMessage,
  IdentifyMessage,
  SetPersonPropertiesMessage,
  UnsetPersonPropertiesMessage,
} from "posthog-node";

type Properties = Record<string, unknown>;

type FakeMessage = {
  distinct_id: string;
  event: string;
  properties: Properties;
  uuid: string;
  timestamp: Date | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIBRARY = {
  $lib: "posthog-node",
  $lib_version: "5.52.6",
  $is_server: true,
  $geoip_disable: true,
};

/**
 * The `PostHog` client of posthog-node 5.52.6 for the tests, on @posthog/core
 * 1.55.2, with each member the adapter calls typed as the real client types
 * it. Like the real one it takes the distinct id on every call and holds no
 * person between calls: `capture` without a distinct id, or with an empty one,
 * records the event without a person under an id of its own; `$groups` comes
 * from `groups` only when that holds a membership, so a `$groups` property
 * survives otherwise; `$lib`, `$lib_version`, `$is_server` and `$geoip_disable`
 * overwrite the caller's; a `uuid` that is not a UUID is replaced;
 * `setPersonProperties` with nothing to set sends nothing;
 * `unsetPersonProperties` leaves out every blank name and sends nothing when
 * none is left; `groupIdentify` without a distinct id sends under
 * `$<type>_<key>`. Every call waits in a queue until the test calls
 * `send()`, which delivers it and settles the flushes waiting, or
 * `refuse(error)`, which drops the queue and rejects them, as posthog-node
 * drops a batch PostHog answers outside 2xx. `flush()` resolves at once when
 * the queue is empty. `calls` records every call in order with its arguments,
 * `shutdown` included.
 *
 * It proves which calls the adapter makes and what posthog-node would send
 * for them. It does not model `withContext`, `register`, `before_send`,
 * feature flags, retries or the network; `posthog.sdk.test.ts` runs the real
 * client for those.
 */
export const fakePostHog = () => {
  const calls: [method: string, ...parameters: unknown[]][] = [];
  const queued: FakeMessage[] = [];
  const sent: FakeMessage[] = [];
  const flushes: { resolve: () => void; reject: (error: Error) => void }[] = [];
  let generated = 0;

  const createId = () => {
    generated += 1;

    return `generated-${generated}`;
  };

  const enqueue = ({
    uuid,
    ...message
  }: Omit<FakeMessage, "uuid"> & { uuid?: string | undefined }) => {
    queued.push({
      ...message,
      uuid: uuid !== undefined && UUID.test(uuid) ? uuid : createId(),
    });
  };

  const send = () => {
    sent.push(...queued.splice(0));

    for (const { resolve } of flushes.splice(0)) {
      resolve();
    }
  };

  const refuse = (error: Error) => {
    queued.splice(0);

    for (const { reject } of flushes.splice(0)) {
      reject(error);
    }
  };

  const sdk = {
    capture: (message: EventMessage) => {
      calls.push(["capture", message]);

      const groups = message.groups ?? {};
      const distinctId = message.distinctId || createId();

      enqueue({
        distinct_id: distinctId,
        event: message.event,
        properties: {
          ...message.properties,
          ...(message.distinctId ? {} : { $process_person_profile: false }),
          ...(Object.keys(groups).length > 0 ? { $groups: groups } : {}),
          ...LIBRARY,
        },
        uuid: message.uuid,
        timestamp: message.timestamp ?? null,
      });
    },
    identify: (message: IdentifyMessage) => {
      calls.push(["identify", message]);

      const { $set, $set_once, $anon_distinct_id, ...rest }: Properties =
        message.properties ?? {};

      enqueue({
        distinct_id: message.distinctId,
        event: "$identify",
        properties: {
          $set: $set || rest,
          $set_once: $set_once || {},
          ...($anon_distinct_id === undefined ? {} : { $anon_distinct_id }),
          ...LIBRARY,
        },
        timestamp: null,
      });
    },
    setPersonProperties: (message: SetPersonPropertiesMessage) => {
      calls.push(["setPersonProperties", message]);

      const set: Properties = message.properties ?? {};
      const setOnce: Properties = message.propertiesOnce ?? {};

      if (Object.keys(set).length === 0 && Object.keys(setOnce).length === 0) {
        return;
      }

      enqueue({
        distinct_id: message.distinctId,
        event: "$set",
        properties: {
          ...(Object.keys(set).length > 0 ? { $set: set } : {}),
          ...(Object.keys(setOnce).length > 0 ? { $set_once: setOnce } : {}),
          ...LIBRARY,
        },
        timestamp: null,
      });
    },
    unsetPersonProperties: (message: UnsetPersonPropertiesMessage) => {
      calls.push(["unsetPersonProperties", message]);

      const names = [message.properties].flat().flatMap((name) => {
        if (name.trim() === "") {
          return [];
        }

        return [name];
      });

      if (names.length === 0) {
        return;
      }

      enqueue({
        distinct_id: message.distinctId,
        event: "$set",
        properties: { $unset: names, ...LIBRARY },
        timestamp: null,
      });
    },
    groupIdentify: (message: GroupIdentifyMessage) => {
      calls.push(["groupIdentify", message]);

      const { groupType, groupKey } = message;

      enqueue({
        distinct_id: message.distinctId || `$${groupType}_${groupKey}`,
        event: "$groupidentify",
        properties: {
          $group_type: groupType,
          $group_key: groupKey,
          $group_set: message.properties ?? {},
          ...LIBRARY,
        },
        timestamp: null,
      });
    },
    flush: () => {
      calls.push(["flush"]);

      if (queued.length === 0) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        flushes.push({ resolve, reject });
      });
    },
    shutdown: () => {
      calls.push(["shutdown"]);

      return Promise.resolve();
    },
  };

  return { sdk, calls, queued, sent, send, refuse };
};
