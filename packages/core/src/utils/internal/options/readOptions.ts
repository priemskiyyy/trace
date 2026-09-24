import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { DestinationName } from "src/types/DestinationName";
import type { Destinations } from "src/types/Destinations";
import type { EventDefinition } from "src/types/EventDefinition";
import type { Layer } from "src/types/internal/Layer";
import type { PrivacyPolicy } from "src/types/internal/PrivacyPolicy";
import type { StandardSchema } from "src/types/StandardSchema";
import type { TraceLimits } from "src/types/TraceLimits";
import type { TracePrivacy } from "src/types/TracePrivacy";
import type { TraceSchema } from "src/types/TraceSchema";
import { isPlainObject } from "src/utils/common/isPlainObject";
import { DEFAULT_BUFFER, DEFAULT_TIMEOUT } from "src/utils/constants/defaults";
import { DEFAULT_LIMITS } from "src/utils/constants/limits";
import { composeContext } from "src/utils/internal/intake/composeContext";
import { getLayerLosses } from "src/utils/internal/intake/getLayerLosses";
import { prepareLayer } from "src/utils/internal/intake/prepareLayer";
import { resolveCount } from "src/utils/internal/options/resolveCount";
import { resolveDuration } from "src/utils/internal/options/resolveDuration";
import { isSensitiveKey } from "src/utils/isSensitiveKey";
import { TraceError } from "src/utils/TraceError";

type Options<TDestinations extends Destinations, TConsent> = {
  events: Record<string, EventDefinition<never, unknown>>;
  destinations: TDestinations;
  schema?: TraceSchema | undefined;
  defaults?: { to?: unknown; context?: unknown } | undefined;
  consent?: TConsent;
  privacy?: TracePrivacy | undefined;
  buffer?: { capacity?: unknown; maxAge?: unknown } | undefined;
  timeout?: unknown;
  now?: unknown;
};

type Validators = Map<string, StandardSchema<unknown, unknown>>;

const createInvalid = (message: string, cause?: unknown) =>
  new TraceError({ code: "INVALID_CONFIGURATION", message, cause });

const readEvents = (
  events: Record<string, EventDefinition<never, unknown>>,
) => {
  if (!isPlainObject(events)) {
    throw createInvalid("events must be an object of event definitions.");
  }

  const definitions = new Map<string, EventDefinition<unknown, unknown>>(
    Object.entries(events),
  );

  if (definitions.has("")) {
    throw createInvalid("events cannot declare an event with an empty name.");
  }

  return definitions;
};

const readConsent = (consent: unknown, names: string[]) => {
  if (consent === undefined || consent === null) {
    return [];
  }

  if (!isPlainObject(consent)) {
    throw createInvalid(
      "consent must be an object of purposes by destination name.",
    );
  }

  const gated = Object.getOwnPropertyNames(consent);

  for (const name of gated) {
    if (!names.includes(name)) {
      throw createInvalid(`consent names "${name}", which no destination has.`);
    }
  }

  return gated;
};

const readAdapter = (
  name: string,
  adapter: AnalyticsAdapter | undefined,
): AnalyticsAdapter => {
  const refusal = `destinations.${name} must be an adapter: an object with a name string and an open function.`;

  if (typeof adapter !== "object" || adapter === null) {
    throw createInvalid(refusal);
  }

  const { name: adapterName, open } = adapter;

  if (typeof adapterName !== "string" || typeof open !== "function") {
    throw createInvalid(refusal);
  }

  return Object.freeze({ name: adapterName, open: () => open.call(adapter) });
};

const readValidators = (
  validators: Record<string, StandardSchema<unknown, unknown>>,
  option: string,
): Validators => {
  if (!isPlainObject(validators)) {
    throw createInvalid(`${option} must be an object of validators.`);
  }

  return new Map(Object.entries(validators));
};

const readSchema = (schema: TraceSchema | undefined) => {
  if (schema === undefined) {
    return { traits: null, groups: null };
  }

  if (!isPlainObject(schema)) {
    throw createInvalid(
      "schema must be an object with traits and groups validators.",
    );
  }

  const { traits, groups } = schema;

  if (groups !== undefined && !isPlainObject(groups)) {
    throw createInvalid(
      "schema.groups must be an object of validators by group type.",
    );
  }

  return {
    traits:
      traits === undefined ? null : readValidators(traits, "schema.traits"),
    groups:
      groups === undefined
        ? null
        : new Map(
            Object.entries(groups).map(
              ([type, validators]): [string, Validators] => [
                type,
                readValidators(validators, `schema.groups.${type}`),
              ],
            ),
          ),
  };
};

const readTo = (to: unknown, names: string[]) => {
  if (to === undefined || to === null) {
    return undefined;
  }

  if (typeof to === "function") {
    return to;
  }

  if (!Array.isArray(to)) {
    throw createInvalid(
      "defaults.to must be a list of destination names or a function.",
    );
  }

  const list: unknown[] = to;

  for (const name of list) {
    if (typeof name !== "string" || !names.includes(name)) {
      throw createInvalid(
        `defaults.to names "${String(name)}", which no destination has.`,
      );
    }
  }

  return Object.freeze([...list]);
};

const getDefaultLayer = (context: unknown, policy: PrivacyPolicy) => {
  try {
    return prepareLayer(context, { root: "context", policy });
  } catch (error) {
    throw createInvalid("defaults.context could not be sanitized.", error);
  }
};

const readContext = (context: unknown, policy: PrivacyPolicy): Layer => {
  const { layer, refused } = getDefaultLayer(context, policy);

  if (refused.length > 0) {
    throw createInvalid("defaults.context must be an object.");
  }

  const invalid = getLayerLosses(layer).flatMap(({ path, reason }) => {
    if (reason !== "invalid") {
      return [];
    }

    return [path];
  });

  if (invalid.length > 0) {
    throw createInvalid(
      `defaults.context is invalid at ${invalid.join(", ")}.`,
    );
  }

  return composeContext([layer]);
};

const getClock = (now: unknown) => () => {
  if (typeof now !== "function") {
    return Date.now();
  }

  try {
    const time: unknown = now();

    return typeof time === "number" && Number.isFinite(time)
      ? time
      : Date.now();
  } catch {
    return Date.now();
  }
};

const readAll = <TDestinations extends Destinations, TConsent>(
  options: Options<TDestinations, TConsent>,
) => {
  const events = readEvents(options.events);
  const configured = options.destinations;

  if (
    typeof configured !== "object" ||
    configured === null ||
    Array.isArray(configured)
  ) {
    throw createInvalid(
      "destinations must be an object of adapters by destination name.",
    );
  }

  const names = Object.keys(configured);
  const consent = options.consent;
  const gated = readConsent(consent, names);
  const defaults: { to?: unknown; context?: unknown } = options.defaults ?? {};
  const privacy: TracePrivacy = options.privacy ?? {};
  const limits: Partial<TraceLimits> = privacy.limits ?? {};
  const redact = privacy.redact ?? isSensitiveKey;
  const buffer: { capacity?: unknown; maxAge?: unknown } = options.buffer ?? {};

  const destinations: {
    name: DestinationName<TDestinations>;
    adapter: AnalyticsAdapter;
    gated: boolean;
  }[] = [];

  for (const name in configured) {
    if (!Object.hasOwn(configured, name)) {
      continue;
    }

    destinations.push({
      name,
      adapter: readAdapter(name, configured[name]),
      gated: gated.includes(name),
    });
  }

  const to = readTo(defaults.to, names);

  if (typeof redact !== "function") {
    throw createInvalid("privacy.redact must be a function.");
  }

  const policy: PrivacyPolicy = Object.freeze({
    redact,
    limits: Object.freeze({
      depth: resolveCount(
        "privacy.limits.depth",
        limits.depth,
        DEFAULT_LIMITS.depth,
      ),
      breadth: resolveCount(
        "privacy.limits.breadth",
        limits.breadth,
        DEFAULT_LIMITS.breadth,
      ),
      stringLength: resolveCount(
        "privacy.limits.stringLength",
        limits.stringLength,
        DEFAULT_LIMITS.stringLength,
      ),
      totalSize: resolveCount(
        "privacy.limits.totalSize",
        limits.totalSize,
        DEFAULT_LIMITS.totalSize,
      ),
    }),
  });

  return {
    events,
    destinations,
    consent,
    schema: readSchema(options.schema),
    to,
    context: readContext(defaults.context, policy),
    policy,
    buffer: {
      capacity: resolveCount(
        "buffer.capacity",
        buffer.capacity,
        DEFAULT_BUFFER.capacity,
      ),
      maxAge: resolveDuration(
        "buffer.maxAge",
        buffer.maxAge,
        DEFAULT_BUFFER.maxAge,
      ),
    },
    timeout: resolveDuration("timeout", options.timeout, DEFAULT_TIMEOUT),
    now: getClock(options.now),
  };
};

export const readOptions = <TDestinations extends Destinations, TConsent>(
  options: Options<TDestinations, TConsent>,
) => {
  try {
    return readAll(options);
  } catch (error) {
    if (error instanceof TraceError) {
      throw error;
    }

    throw createInvalid("Trace's options could not be read.", error);
  }
};
