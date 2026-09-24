/**
 * What an adapter's `flush` receives: the time left, and a signal that aborts
 * when that time runs out.
 *
 * @example
 * ```ts
 * flush: async ({ timeout }) => {
 *   await sdk.flush({ timeout });
 *
 *   return { status: "flushed" };
 * },
 * ```
 */
export type FlushContext = {
  /** Milliseconds left of the caller's `flush` timeout. */
  timeout: number;
  /** Aborts when the time runs out or the Trace is disposed. It bounds the wait and cancels no provider work. */
  signal: AbortSignal;
};
