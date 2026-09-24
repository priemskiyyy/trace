import type {
  ApiObject,
  ApiOptions,
  IdentifyTraits,
} from "@rudderstack/analytics-js";

type ResetEntries = {
  anonymousId?: boolean;
  userId?: boolean;
  userTraits?: boolean;
  groupId?: boolean;
  groupTraits?: boolean;
  sessionInfo?: boolean;
  authToken?: boolean;
};

type FakeRudderStackEvent =
  | {
      type: "track";
      event: string;
      properties: unknown;
      userId: string;
      anonymousId: string;
      originalTimestamp: string | null;
      messageId: string;
      context: unknown;
    }
  | {
      type: "identify";
      userId: string;
      anonymousId: string;
      context: unknown;
    }
  | {
      type: "group";
      groupId: string;
      traits: unknown;
      userId: string;
      anonymousId: string;
    };

// RudderStack's serializer leaves out every null object member and keeps a null list item.
const withoutNulls = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(withoutNulls);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, nested]: [string, unknown]) => {
      if (nested === null) {
        return [];
      }

      return [[key, withoutNulls(nested)]];
    }),
  );
};

// RudderStack merges traits deeply: an object key by key and a list index by index, each keeping what the new value lacks.
const mergeDeepRight = (held: unknown, next: unknown): unknown => {
  if (Array.isArray(held) && Array.isArray(next)) {
    return [
      ...next.map((item: unknown, index) => mergeDeepRight(held[index], item)),
      ...held.slice(next.length),
    ];
  }

  if (
    typeof held !== "object" ||
    held === null ||
    Array.isArray(held) ||
    typeof next !== "object" ||
    next === null ||
    Array.isArray(next)
  ) {
    return next;
  }

  const merged = new Map<string, unknown>(Object.entries(held));

  for (const [key, value] of Object.entries(next)) {
    merged.set(
      key,
      merged.has(key) ? mergeDeepRight(merged.get(key), value) : value,
    );
  }

  return Object.fromEntries(merged);
};

/**
 * The `RudderAnalytics` of @rudderstack/analytics-js 3.34.1 for the tests.
 * Like the real one it holds every call made before `load` and replays it in
 * order once loaded, keeps `originalTimestamp` and generates its own message
 * id while any other option lands in the event's context, merges traits and
 * group traits deeply into the ones it holds, whichever group they came from,
 * clears the traits it holds when `identify` names a user without traits,
 * resets on its own when `identify` names another user, keeps the anonymous id
 * through a reset unless told otherwise, and sends every event with each null
 * object member left out. `calls` records every call in order with its
 * arguments, and `events` what RudderStack would send. It proves what the
 * adapter hands RudderStack and what reaches the wire; it does not model
 * sessions, plugins, consent or delivery, and `rudderstack.sdk.test.ts` runs
 * the real SDK for delivery.
 */
export const fakeRudderStack = ({
  loaded = true,
}: { loaded?: boolean } = {}) => {
  const state: {
    loaded: boolean;
    userId: string;
    userTraits: unknown;
    anonymousId: string;
    groupId: string;
    groupTraits: unknown;
  } = {
    loaded,
    userId: "",
    userTraits: {},
    anonymousId: "anonymous-1",
    groupId: "",
    groupTraits: {},
  };

  const calls: [method: string, ...parameters: unknown[]][] = [];
  const events: FakeRudderStackEvent[] = [];
  const buffered: (() => void)[] = [];
  let anonymousCount = 1;

  const run = (call: () => void) => {
    if (!state.loaded) {
      buffered.push(call);

      return;
    }

    call();
  };

  const applyReset = (entries: ResetEntries) => {
    if (entries.userId !== false) {
      state.userId = "";
    }

    if (entries.userTraits !== false) {
      state.userTraits = {};
    }

    if (entries.groupId !== false) {
      state.groupId = "";
    }

    if (entries.groupTraits !== false) {
      state.groupTraits = {};
    }

    if (entries.anonymousId === true) {
      anonymousCount += 1;
      state.anonymousId = `anonymous-${anonymousCount}`;
    }
  };

  const sdk = {
    load: (writeKey: string, dataPlaneUrl: string) => {
      calls.push(["load", writeKey, dataPlaneUrl]);
      state.loaded = true;

      for (const call of buffered.splice(0)) {
        call();
      }
    },
    track: (
      event: string,
      properties: ApiObject | null | undefined,
      options: ApiOptions,
    ) => {
      calls.push(["track", event, properties, options]);
      run(() => {
        const { originalTimestamp, ...context } = options;

        events.push({
          type: "track",
          event,
          properties: withoutNulls(properties ?? {}),
          userId: state.userId,
          anonymousId: state.anonymousId,
          originalTimestamp: originalTimestamp ?? null,
          messageId: `message-${events.length + 1}`,
          context: withoutNulls({ ...context, traits: state.userTraits }),
        });
      });
    },
    identify: (
      ...parameters: [
        idOrTraits: string | IdentifyTraits,
        traits?: IdentifyTraits,
      ]
    ) => {
      calls.push(["identify", ...parameters]);
      run(() => {
        const [idOrTraits, traits] = parameters;
        const incoming = typeof idOrTraits === "string" ? traits : idOrTraits;

        if (typeof idOrTraits === "string") {
          if (state.userId !== "" && idOrTraits !== state.userId) {
            applyReset({});
          }

          state.userId = idOrTraits;
        }

        state.userTraits =
          incoming === undefined
            ? {}
            : mergeDeepRight(state.userTraits, incoming);

        events.push({
          type: "identify",
          userId: state.userId,
          anonymousId: state.anonymousId,
          context: withoutNulls({ traits: state.userTraits }),
        });
      });
    },
    group: (groupId: string, traits: IdentifyTraits | null | undefined) => {
      calls.push(["group", groupId, traits]);
      run(() => {
        state.groupId = groupId;
        state.groupTraits =
          traits === null || traits === undefined
            ? {}
            : mergeDeepRight(state.groupTraits, traits);

        events.push({
          type: "group",
          groupId,
          traits: withoutNulls(state.groupTraits),
          userId: state.userId,
          anonymousId: state.anonymousId,
        });
      });
    },
    reset: (options: { entries: ResetEntries }) => {
      calls.push(["reset", options]);
      run(() => {
        applyReset(options.entries);
      });
    },
  };

  return { sdk, state, calls, events };
};
