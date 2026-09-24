import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import type { HttpAdapterOptions } from "src/types/HttpAdapterOptions";

/**
 * Sends each event to your own backend through your own client. A request
 * that resolves is `backend-acknowledged` evidence, one that throws is a
 * failure, and an event is sent once: there is no retry, no queue and no
 * batching. An event whose user has signed out or switched accounts since it
 * was tracked is never sent, because your client authenticates as whoever is
 * signed in now.
 *
 * @example
 * ```ts
 * const trace = new Trace({
 *   events,
 *   destinations: {
 *     backend: http({
 *       request: async ({ event, signal }) => {
 *         const response = await fetch("/api/events", {
 *           method: "POST",
 *           headers: { "content-type": "application/json", "idempotency-key": event.id },
 *           body: JSON.stringify(event),
 *           signal,
 *         });
 *
 *         if (!response.ok) {
 *           throw new Error(`The events endpoint answered ${response.status}.`);
 *         }
 *       },
 *     }),
 *   },
 * });
 * ```
 */
export const http = ({
  request,
}: HttpAdapterOptions): AnalyticsAdapter<HttpAdapterOptions["request"]> => ({
  name: "http",
  open: () => ({
    native: request,
    track: async (event, { signal }) => {
      const acknowledgement = await request({ event, signal });

      if (typeof acknowledgement !== "object") {
        return { status: "submitted", evidence: "backend-acknowledged" };
      }

      return {
        status: "submitted",
        evidence: "backend-acknowledged",
        event: { id: acknowledgement.id },
      };
    },
  }),
});
