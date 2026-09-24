import type { AmplitudeEventOptions } from "src/types/AmplitudeEventOptions";
import type { AmplitudeIdentifyLike } from "src/types/AmplitudeIdentifyLike";

/**
 * The part of an Amplitude SDK the adapter calls. The module namespace of
 * `@amplitude/analytics-browser` or `@amplitude/analytics-react-native`, or an
 * instance from `createInstance()`, satisfies it, so this package imports no
 * SDK: the application passes in the one it initialized.
 *
 * @example
 * ```ts
 * import * as Amplitude from "@amplitude/analytics-browser";
 *
 * const sdk: AmplitudeLike = Amplitude;
 * ```
 */
export type AmplitudeLike = {
  /** Answers at once; the promise settles with the upload's status code once Amplitude has sent the event. */
  track: (
    name: string,
    properties: Record<string, unknown>,
    options: AmplitudeEventOptions,
  ) => { promise: Promise<{ code: number }> };
  /** The device Amplitude holds now, `undefined` until its `init` has given it one. */
  getDeviceId: () => string | undefined;
  setUserId: (userId: string) => unknown;
  // A method, so that the SDK's own Identify type is accepted in place of the two calls named here.
  /** Sends user properties, and moves Amplitude to the user and device its options name. */
  identify(
    identify: AmplitudeIdentifyLike,
    options: AmplitudeEventOptions,
  ): { promise: Promise<unknown> };
  /** Overwrites the membership held under the group type, an empty list included. */
  setGroup: (
    type: string,
    name: string | string[],
    options: AmplitudeEventOptions,
  ) => { promise: Promise<unknown> };
  // A method, so that the SDK's own Identify type is accepted in place of the two calls named here.
  groupIdentify(
    type: string,
    name: string,
    identify: AmplitudeIdentifyLike,
    options: AmplitudeEventOptions,
  ): { promise: Promise<unknown> };
  /** Clears the user id and starts a new device id. */
  reset: () => unknown;
  setOptOut: (optOut: boolean) => unknown;
  /** Answers at once while an earlier upload is still in flight, and never rejects. */
  flush: () => { promise: Promise<void> };
};
