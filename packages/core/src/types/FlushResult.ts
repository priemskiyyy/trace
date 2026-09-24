/**
 * What an adapter answers when asked to flush its provider's queue.
 *
 * @example
 * ```ts
 * flush: async () => {
 *   await sdk.flush();
 *
 *   return { status: "flushed" };
 * },
 * ```
 */
export type FlushResult =
  | { status: "flushed" }
  | { status: "timeout" }
  | { status: "failed"; error: unknown };
