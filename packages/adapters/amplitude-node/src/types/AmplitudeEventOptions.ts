/**
 * The options of an Amplitude call: the event's time and id, and the user and
 * device the call is filed under.
 *
 * @example
 * ```ts
 * const options: AmplitudeEventOptions = {
 *   time: 1767225600000,
 *   insert_id: "0b5f6c9e-8f1a-4c2d-9a3b-2f6e1d4c7a88",
 *   user_id: "user_42",
 *   device_id: "visitor_7",
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
};
