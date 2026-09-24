import type {
  AmplitudeEventOptions,
  AmplitudeLike,
  IdentityPlugin,
} from "@priemskiyyy/trace-amplitude";

import type { ProviderCall } from "example-shared/simulated/types/ProviderCall";
import { createEventLog } from "example-shared/utils/createEventLog";
import { createValueStore } from "example-shared/utils/createValueStore";

class SimulatedIdentify {
  #changes: Record<string, unknown> = {};

  set = (property: string, value: unknown) => {
    this.#changes[property] = value;

    return this;
  };

  unset = (property: string) => {
    this.#changes[property] = null;

    return this;
  };

  getChanges = () => this.#changes;
}

/**
 * A device in the page that Amplitude's browser SDK would run on. It reads
 * identity straight from the top of each call's options, which the identity
 * plugin also carries in `extra` for a real, deferred timeline; this one
 * processes every call at once, so it needs only the former.
 */
export const createSimulatedAmplitude = () => {
  const inbox = createEventLog<ProviderCall>(20);
  const optedOut = createValueStore(false);
  let nextId = 1;

  const record = (
    name: string,
    body: unknown,
    options: AmplitudeEventOptions,
  ) => {
    inbox.add({
      id: `amplitude_${nextId}`,
      eventName: name,
      user: options.user_id ?? null,
      body,
      at: Date.now(),
    });
    nextId += 1;
  };

  const sdk = {
    track: (
      name: string,
      properties: Record<string, unknown>,
      options: AmplitudeEventOptions,
    ) => {
      record(name, properties, options);

      return { promise: Promise.resolve({ code: optedOut.get() ? 0 : 200 }) };
    },
    getDeviceId: () => "device-1",
    setUserId: () => {},
    identify(identify: SimulatedIdentify, options: AmplitudeEventOptions) {
      record("$identify", identify.getChanges(), options);

      return { promise: Promise.resolve({}) };
    },
    setGroup: (
      type: string,
      name: string | string[],
      options: AmplitudeEventOptions,
    ) => {
      record("$identify", { [type]: name }, options);

      return { promise: Promise.resolve({}) };
    },
    groupIdentify(
      type: string,
      name: string | string[],
      identify: SimulatedIdentify,
      options: AmplitudeEventOptions,
    ) {
      record(
        "$groupidentify",
        { ...identify.getChanges(), [type]: name },
        options,
      );

      return { promise: Promise.resolve({}) };
    },
    reset: () => {},
    setOptOut: (optOut: boolean) => {
      optedOut.set(optOut);
    },
    flush: () => ({ promise: Promise.resolve() }),
  } satisfies AmplitudeLike;

  return {
    sdk,
    Identify: SimulatedIdentify,
    inbox: inbox.log,
    optedOut,
    addPlugin: (plugin: IdentityPlugin) => plugin.setup(),
  };
};
