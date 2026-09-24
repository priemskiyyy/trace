import type { AmplitudeEventOptions } from "src/types/AmplitudeEventOptions";
import type { AmplitudeIdentifyLike } from "src/types/AmplitudeIdentifyLike";

/**
 * The part of the Amplitude Node SDK the adapter calls. The module namespace
 * of `@amplitude/analytics-node`, or an instance from `createInstance()`,
 * satisfies it, so this package imports no SDK: the application passes in the
 * one it initialized.
 *
 * @example
 * ```ts
 * import * as Amplitude from "@amplitude/analytics-node";
 *
 * const sdk: AmplitudeLike = Amplitude;
 * ```
 */
export type AmplitudeLike = {
  /** Answers at once; the promise settles with the upload's status code once Amplitude has sent the event, or with code 0 while opted out. */
  track: (
    name: string,
    properties: Record<string, unknown>,
    options: AmplitudeEventOptions,
  ) => { promise: Promise<{ code: number }> };
  // A method, so that the SDK's own Identify type is accepted in place of the two calls named here.
  /** Sends user properties for the user and device its options name. */
  identify(
    identify: AmplitudeIdentifyLike,
    options: AmplitudeEventOptions,
  ): { promise: Promise<{ code: number }> };
  /** Overwrites the membership held under the group type, an empty list included. */
  setGroup: (
    type: string,
    name: string | string[],
    options: AmplitudeEventOptions,
  ) => { promise: Promise<{ code: number }> };
  // A method, so that the SDK's own Identify type is accepted in place of the two calls named here.
  groupIdentify(
    type: string,
    name: string,
    identify: AmplitudeIdentifyLike,
    options: AmplitudeEventOptions,
  ): { promise: Promise<{ code: number }> };
  /** Answers at once while an earlier upload is still in flight, sends without retries, and never rejects. */
  flush: () => { promise: Promise<void> };
  /** Missing from the Node SDK. The browser and React Native SDKs have it: they keep a user and fill it into every call that names none, so they are refused. */
  setUserId?: never;
};
