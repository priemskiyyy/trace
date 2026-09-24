/**
 * The part of Amplitude's `Identify` the adapter uses to set and unset traits,
 * which the generated wrapper has no call for. The application passes in the
 * class, so this package imports no SDK.
 *
 * @example
 * ```ts
 * import * as amplitude from "@amplitude/analytics-browser";
 *
 * ampli({ sdk: Ampli.ampli, Identify: amplitude.Identify });
 * ```
 */
export type AmplitudeIdentifyLike = {
  // A method, so that Amplitude's Identify, which takes only the values it accepts, still fits.
  set(property: string, value: unknown): unknown;
  unset: (property: string) => unknown;
};
