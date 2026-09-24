/**
 * The options of an Amplitude call: the event's time and id, and in `extra`
 * the user and device the call belongs to, which the identity plugin sets.
 *
 * @example
 * ```ts
 * const options: AmplitudeEventOptions = {
 *   time: 1767225600000,
 *   insert_id: "0b5f6c9e-8f1a-4c2d-9a3b-2f6e1d4c7a88",
 *   extra: {
 *     "@priemskiyyy/trace-amplitude": {
 *       user_id: "user_42",
 *       device_id: "a8f5f167-f44f-4964-a6c8-4f8d5b5b2d2e",
 *     },
 *   },
 * };
 * ```
 */
export type AmplitudeEventOptions = {
  /** The event's time, in epoch milliseconds. */
  time?: number;
  /** Amplitude ignores a repeated insert id from the same device for 7 days. */
  insert_id?: string;
  user_id?: string;
  device_id?: string;
  /** Amplitude hands it to every plugin and leaves it out of the upload. */
  extra?: {
    "@priemskiyyy/trace-amplitude"?: { user_id?: string; device_id?: string };
  };
};
