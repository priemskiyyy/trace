import type { AmpliEventOptions } from "src/types/AmpliEventOptions";
import type { AmplitudeIdentifyLike } from "src/types/AmplitudeIdentifyLike";

/**
 * The part of a generated Ampli wrapper the adapter calls. The `ampli` object
 * that `ampli pull` generates for the browser satisfies it, so this package
 * imports no SDK: the application passes in the wrapper it loaded.
 *
 * @example
 * ```ts
 * import * as Ampli from "./ampli";
 *
 * await Ampli.ampli.load({ environment: "production" }).promise;
 *
 * const plugin = identityPlugin();
 *
 * Ampli.ampli.client.add(plugin);
 * ampli({ sdk: Ampli.ampli, Identify: amplitude.Identify, plugin });
 * ```
 */
export type AmpliLike = {
  /** False until `ampli.load()` ran. Before it, every call sends nothing. */
  isLoaded: boolean;
  /** The Amplitude client the wrapper loaded. Reading it before `ampli.load()` logs an error. */
  client: {
    // A method, so that the real client, which takes Amplitude's whole Identify, still fits.
    identify(
      identify: AmplitudeIdentifyLike,
      options: AmpliEventOptions,
    ): { promise: Promise<unknown> };
    /** The device Amplitude files the next call under, `undefined` until its init has finished. */
    getDeviceId: () => string | undefined;
    /** Clears the user id and starts a new device id. */
    reset: () => void;
    setOptOut: (optOut: boolean) => void;
    /** Answers at once while an earlier upload is still in flight, and never rejects. */
    flush: () => { promise: Promise<unknown> };
  };
  // A method, so that a wrapper whose user properties come from its tracking plan still fits.
  identify(
    userId: string,
    properties?: object,
    options?: AmpliEventOptions,
  ): { promise: Promise<unknown> };
  /** Settles with Amplitude's result code once the upload settled, or with nothing when the wrapper sends nothing; it never rejects. */
  track: (
    event: { event_type: string; event_properties: Record<string, unknown> },
    options: AmpliEventOptions,
  ) => { promise: Promise<{ code: number } | void> };
};
