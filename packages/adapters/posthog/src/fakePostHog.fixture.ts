import type { CaptureOptions, CaptureResult, PostHogConfig } from "posthog-js";

type Properties = Record<string, unknown>;

type FakeConfig = {
  cookieless_mode?: NonNullable<PostHogConfig["cookieless_mode"]>;
  person_profiles?: NonNullable<PostHogConfig["person_profiles"]>;
  opt_out_capturing_by_default?: boolean;
  properties_string_max_length?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// posthog-js refuses these ids in identify, the first four in any case.
const REFUSED_IDS = ["distinct_id", "distinctid", "undefined", "null"];

const getCut = (value: unknown, maxLength: number): unknown => {
  if (typeof value === "string") {
    return value.slice(0, maxLength);
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => getCut(item, maxLength));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]: [string, unknown]) => [
      key,
      getCut(nested, maxLength),
    ]),
  );
};

/**
 * posthog-js 1.434.2 for the tests, with each member the adapter calls typed
 * as the real `PostHog` types it. Nothing is captured before `init`, while
 * opted out or when `before_send` drops the event, and each of those answers
 * `undefined`. A caller's properties are merged over the registered `$groups`
 * and the distinct id, so `distinct_id` moves the event to another person and
 * `$groups` adds memberships, while `token` and `$process_person_profile` are
 * the SDK's own, and every string past `properties_string_max_length` is cut,
 * the event's name and uuid included.
 * A `uuid` that is not a UUID is replaced. `register` replaces
 * `$groups` whole, and `getGroups` answers the memberships held, which a test
 * can seed as posthog-js restores them from its storage. `reset` starts a new
 * anonymous person, clears the memberships and returns consent to the
 * configured default. `identify`
 * ignores the ids posthog-js refuses; under `cookieless_mode: "always"` opting
 * in and out is ignored; and under `person_profiles: "never"` so are
 * `identify`, person properties and group properties, while a membership
 * still rides on each event.
 *
 * It proves the calls the adapter makes and what posthog-js would make of
 * them locally. It does not load an extension, run `before_send` or send
 * anything; the real SDK test covers what posthog-js itself does.
 */
export const fakePostHog = ({
  loaded = true,
  config = {},
}: { loaded?: boolean; config?: FakeConfig } = {}) => {
  const state: {
    distinctId: string;
    groups: Record<string, unknown>;
    groupProperties: Record<string, Properties>;
    optedOut: boolean;
    filtered: boolean;
  } = {
    distinctId: "anonymous-1",
    groups: {},
    groupProperties: {},
    optedOut: config.opt_out_capturing_by_default === true,
    filtered: false,
  };

  const captured: CaptureResult[] = [];

  const calls: {
    init: number;
    shutdown: number;
    capture: {
      event: string;
      properties: Properties;
      options: CaptureOptions | undefined;
    }[];
    identify: string[];
    setPersonProperties: Properties[];
    unsetPersonProperties: (string | string[])[];
    group: {
      type: string;
      key: string;
      properties: Properties | undefined;
    }[];
    register: { $groups: Record<string, unknown> }[];
    reset: number;
    opt_in_capturing: (
      { captureEventName?: string | null | false } | undefined
    )[];
    opt_out_capturing: number;
  } = {
    init: 0,
    shutdown: 0,
    capture: [],
    identify: [],
    setPersonProperties: [],
    unsetPersonProperties: [],
    group: [],
    register: [],
    reset: 0,
    opt_in_capturing: [],
    opt_out_capturing: 0,
  };

  let anonymous = 1;

  const hasPersons = () => sdk.config.person_profiles !== "never";

  const getEventGroups = (properties: Properties) => {
    const groups = properties.$groups;

    if (typeof groups !== "object" || groups === null) {
      return {};
    }

    return { $groups: { ...state.groups, ...groups } };
  };

  const record = (
    event: string,
    properties: Properties,
    options?: CaptureOptions,
  ) => {
    if (!sdk.__loaded || state.optedOut || state.filtered) {
      return undefined;
    }

    const maxLength = sdk.config.properties_string_max_length;

    const uuid =
      options?.uuid !== undefined && UUID.test(options.uuid)
        ? options.uuid
        : `generated-${captured.length + 1}`;

    const result: CaptureResult = {
      uuid: uuid.slice(0, maxLength),
      event: event.slice(0, maxLength),
      properties: {
        $groups: { ...state.groups },
        distinct_id: state.distinctId,
        ...Object.fromEntries(
          Object.entries(properties).map(([key, value]) => [
            key,
            getCut(value, maxLength),
          ]),
        ),
        ...getEventGroups(properties),
        token: "phc_fake",
        $process_person_profile: hasPersons(),
      },
      timestamp: options?.timestamp ?? new Date(),
    };

    captured.push(result);

    return result;
  };

  const setOptedOut = (optedOut: boolean) => {
    if (sdk.config.cookieless_mode !== "always") {
      state.optedOut = optedOut;
    }
  };

  const sdk = {
    __loaded: loaded,
    config: { properties_string_max_length: 65_535, ...config },
    init: (_token: string, options: FakeConfig = {}) => {
      calls.init += 1;
      sdk.__loaded = true;
      Object.assign(sdk.config, options);
      state.optedOut = sdk.config.opt_out_capturing_by_default === true;
    },
    shutdown: () => {
      calls.shutdown += 1;
    },
    capture: (
      event: string,
      properties?: Properties | null,
      options?: CaptureOptions,
    ) => {
      calls.capture.push({ event, properties: properties ?? {}, options });

      return record(event, properties ?? {}, options);
    },
    identify: (id: string) => {
      calls.identify.push(id);

      if (
        hasPersons() &&
        id !== "$posthog_cookieless" &&
        !REFUSED_IDS.includes(id.toLowerCase())
      ) {
        state.distinctId = id;
      }
    },
    setPersonProperties: (properties?: Properties) => {
      calls.setPersonProperties.push(properties ?? {});

      if (hasPersons()) {
        record("$set", { $set: properties ?? {} });
      }
    },
    unsetPersonProperties: (names: string | string[]) => {
      calls.unsetPersonProperties.push(names);

      if (hasPersons()) {
        record("$set", { $unset: Array.isArray(names) ? names : [names] });
      }
    },
    group: (type: string, key: string, properties?: Properties) => {
      calls.group.push({ type, key, properties });
      state.groups = { ...state.groups, [type]: key };

      if (properties !== undefined && hasPersons()) {
        state.groupProperties[`${type}:${key}`] = {
          ...state.groupProperties[`${type}:${key}`],
          ...properties,
        };
      }
    },
    register: (properties: { $groups: Record<string, unknown> }) => {
      calls.register.push(properties);
      state.groups = { ...properties.$groups };
    },
    getGroups: () => ({ ...state.groups }),
    reset: () => {
      calls.reset += 1;
      anonymous += 1;
      state.distinctId = `anonymous-${anonymous}`;
      state.groups = {};
      state.optedOut = sdk.config.opt_out_capturing_by_default === true;
    },
    opt_in_capturing: (options?: {
      captureEventName?: string | null | false;
    }) => {
      calls.opt_in_capturing.push(options);
      setOptedOut(false);

      if (
        options?.captureEventName !== false &&
        options?.captureEventName !== null
      ) {
        record(options?.captureEventName ?? "$opt_in", {});
      }
    },
    opt_out_capturing: () => {
      calls.opt_out_capturing += 1;
      setOptedOut(true);
    },
  };

  return { sdk, state, calls, captured };
};
