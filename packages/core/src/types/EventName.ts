/**
 * The names a registry declares, which `track` accepts.
 *
 * @example
 * ```ts
 * const name: EventName<typeof events> = "Checkout Started";
 * ```
 */
export type EventName<TEvents> = keyof TEvents & string;
