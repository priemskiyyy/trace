import type { HeapLike } from "src/types/HeapLike";

/**
 * Options for `heap()`. The application loads Heap and owns it; Trace only
 * calls it.
 *
 * @example
 * ```ts
 * // currentHeap reads window.heap on every call, because heap.js replaces it when it loads.
 * heap({ sdk: currentHeap });
 * ```
 */
export type HeapAdapterOptions<TSdk extends HeapLike> = {
  /** The heap.js global once it has loaded, or an object that reads the current `window.heap` on every call. */
  sdk: TSdk;
};
