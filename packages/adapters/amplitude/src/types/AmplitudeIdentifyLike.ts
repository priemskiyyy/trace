/**
 * The part of Amplitude's `Identify` the adapter uses to set and unset user
 * and group properties. The application passes in the class from its SDK, so
 * this package imports no SDK.
 *
 * @example
 * ```ts
 * import * as Amplitude from "@amplitude/analytics-browser";
 *
 * const identify: AmplitudeIdentifyLike = new Amplitude.Identify();
 * ```
 */
export type AmplitudeIdentifyLike = {
  // A method, so that Amplitude's Identify, which narrows the value it takes, is accepted.
  /** Drops the whole property, in silence, when a `null` sits anywhere in the value, or a boolean or an array sits inside an array. */
  set(property: string, value: unknown): unknown;
  unset: (property: string) => unknown;
};
