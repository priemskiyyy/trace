/**
 * The reference your backend gave an event, when it gives one. It becomes
 * `event.id` on this destination's outcome.
 *
 * @example
 * ```ts
 * const acknowledgement: HttpAcknowledgement = { id: "evt_1" };
 * ```
 */
export type HttpAcknowledgement = {
  id: string;
};
