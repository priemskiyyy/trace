/**
 * A reactive value read through `current`, the way Svelte's own reactive
 * classes expose one. It is read, never written.
 *
 * @example
 * ```ts
 * const status: ReadableValue<TraceStatus> = useTraceStatus();
 * ```
 */
export type ReadableValue<TValue> = { get current(): TValue };
