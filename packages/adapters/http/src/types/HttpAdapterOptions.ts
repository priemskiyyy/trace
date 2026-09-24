import type { HttpAcknowledgement } from "src/types/HttpAcknowledgement";
import type { HttpRequest } from "src/types/HttpRequest";

/**
 * Options for `http()`. Your own client owns the transport: the address,
 * authentication, headers, body, batching, retries and response handling.
 *
 * @example
 * ```ts
 * http({
 *   request: async ({ event, signal }) => {
 *     const { id } = await api.events.create(event, { signal });
 *
 *     return { id };
 *   },
 * });
 * ```
 */
export type HttpAdapterOptions = {
  /**
   * Sends one event. Resolve only once your backend has accepted it, with
   * the id it gave the event if it gives one; throw or reject when it has
   * not. Pass `signal` on, and send `event.id` as the idempotency key, so a
   * retry never records an event twice.
   */
  request: (
    request: HttpRequest,
  ) => HttpAcknowledgement | void | PromiseLike<HttpAcknowledgement | void>;
};
