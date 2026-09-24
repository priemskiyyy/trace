/**
 * The options of an Ampli call the adapter makes, with the user and device the
 * call was made for both at the top level, where Amplitude keeps them, and in
 * `extra`, where the identity plugin reads them.
 *
 * @example
 * ```ts
 * const options: AmpliEventOptions = {
 *   time: 1767225600000,
 *   insert_id: "0b0e7a52-9c1d-4f6e-8a3b-1c2d3e4f5a6b",
 *   user_id: "user_42",
 *   device_id: "a8f5f167-f44f-4964-a6c8-4f8d5b5b2d2e",
 *   extra: {
 *     "@priemskiyyy/trace-ampli": {
 *       user_id: "user_42",
 *       device_id: "a8f5f167-f44f-4964-a6c8-4f8d5b5b2d2e",
 *     },
 *   },
 * };
 * ```
 */
export type AmpliEventOptions = {
  /** The event's time, in epoch milliseconds. */
  time?: number;
  /** Amplitude ignores a repeated insert id from the same device for 7 days. */
  insert_id?: string;
  user_id?: string;
  device_id?: string;
  /** Amplitude hands it to every plugin and leaves it out of the upload. */
  extra?: {
    [key: string]: unknown;
    /** The user and device the identity plugin files the call under. */
    "@priemskiyyy/trace-ampli"?: { user_id?: string; device_id?: string };
  };
};
