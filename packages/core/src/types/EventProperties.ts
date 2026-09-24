import type { EventDefinition } from "src/types/EventDefinition";

/**
 * The properties a declared event carries once parsed: its schema's output, or
 * the type argument of `event<T>()`.
 *
 * @example
 * ```ts
 * const checkout: EventProperties<(typeof events)["Checkout Started"]> = {
 *   cart: { id: "c_1" },
 *   value: 49.5,
 *   currency: "EUR",
 * };
 * ```
 */
export type EventProperties<TDefinition> =
  TDefinition extends EventDefinition<never, infer TOutput> ? TOutput : never;
