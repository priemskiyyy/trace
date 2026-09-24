import type { EventName } from "src/types/EventName";
import type { Receipt } from "src/types/Receipt";
import type { TrackArguments } from "src/types/TrackArguments";

/**
 * A `track` bound to one more context layer, taken when the scope was created.
 * It holds no identity and does not nest.
 *
 * @example
 * ```ts
 * const checkout = trace.scope({ context: { flow: "checkout" } });
 * checkout.track("Checkout Started", { cart: { id: "c_1" }, value: 49.5, currency: "EUR" });
 * ```
 */
export type TraceScope<TEvents, TName extends string> = {
  track: <TKey extends EventName<TEvents>>(
    name: TKey,
    ...args: TrackArguments<TEvents[TKey], TName>
  ) => Receipt<TName>;
};
