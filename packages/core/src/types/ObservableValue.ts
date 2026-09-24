/**
 * A readable value with change notifications. `subscribe` never calls back at
 * once, and answers its unsubscriber.
 *
 * @example
 * ```ts
 * const stop = trace.status.subscribe(() => console.log(trace.status.get().state));
 * ```
 */
export type ObservableValue<TValue> = {
  get: () => TValue;
  subscribe: (listener: () => void) => () => void;
};
