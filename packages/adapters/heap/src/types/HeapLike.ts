/**
 * The part of the heap.js 5 global the adapter calls: `window.heap` once
 * heap.js has loaded, or an object that forwards to it. The snippet's stub is
 * not enough, because heap.js replaces `window.heap` with a new object when it
 * loads and never replays a call made on the stub after that.
 *
 * @example
 * ```ts
 * heap.onReady(() => {
 *   const sdk: HeapLike = window.heap;
 * });
 * ```
 */
export type HeapLike = {
  /** `true` once heap.js has initialized. The snippet's stub has none, and `stopTracking` sets it back to `false`. */
  loaded?: boolean;
  /** Keeps flat values and arrays of them, cuts text, and drops blank and nested values. */
  track: (name: string, properties: Record<string, unknown>) => void;
  /** Ignores an identity Heap refuses, such as `anonymous` or `null`. */
  identify: (identity: string) => void;
  /** Sets or overwrites user properties. Heap has no call that removes one. */
  addUserProperties: (properties: Record<string, unknown>) => void;
  /** Starts a new anonymous user, and does nothing for one who is already anonymous. */
  resetIdentity: () => void;
};
