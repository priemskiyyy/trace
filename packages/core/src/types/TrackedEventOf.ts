import type { EventName } from "src/types/EventName";
import type { EventProperties } from "src/types/EventProperties";
import type { TrackedEvent } from "src/types/TrackedEvent";

/**
 * The union of the events a registry can produce, discriminated by `name`, as
 * `trace.events` delivers them.
 *
 * @example
 * ```ts
 * const handleEvent = (event: TrackedEventOf<typeof events>) =>
 *   event.name === "Checkout Started" ? event.properties.cart.id : null;
 * ```
 */
export type TrackedEventOf<TEvents> = {
  [TName in EventName<TEvents>]: TrackedEvent<
    TName,
    EventProperties<TEvents[TName]>
  >;
}[EventName<TEvents>];
