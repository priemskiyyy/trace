import type { TrackedEvent } from "@priemskiyyy/trace";

/**
 * What `request` receives for one event: the frozen, sanitized event, and a
 * signal that aborts at the timeout and on disposal.
 *
 * @example
 * ```ts
 * const request = async ({ event, signal }: HttpRequest) => {
 *   await fetch("/api/events", { method: "POST", body: JSON.stringify(event), signal });
 * };
 * ```
 */
export type HttpRequest = {
  event: TrackedEvent;
  signal: AbortSignal;
};
