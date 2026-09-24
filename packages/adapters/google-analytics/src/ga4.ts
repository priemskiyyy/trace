import type {
  EventDefinition,
  EventName,
  EventProperties,
  TrackedEvent,
} from "@priemskiyyy/trace";

import type { Ga4Event } from "src/types/Ga4Event";
import type { Ga4EventMap } from "src/types/Ga4EventMap";

/**
 * Builds the adapter's `map` from the event registry: one mapping per
 * declared event, which receives that event with its typed properties and
 * answers the GA4 event to send, or `null` to keep it from Google Analytics.
 *
 * @example
 * ```ts
 * const map = ga4(events, {
 *   "Checkout Started": ({ properties }) =>
 *     ({
 *       name: "begin_checkout",
 *       parameters: { value: properties.total, currency: properties.currency },
 *       items: properties.lines.map(
 *         (line) => ({ item_id: line.sku, price: line.price }) satisfies Ga4Item,
 *       ),
 *     }) satisfies Ga4Event,
 *   "Internal Ping": () => null,
 * });
 * ```
 */
// The overload preserves the name-to-properties relation erased by a lookup by name.
export function ga4<
  TEvents extends Record<string, EventDefinition<never, unknown>>,
>(
  events: TEvents,
  mappings: {
    [TName in EventName<TEvents>]: (
      event: TrackedEvent<TName, EventProperties<TEvents[TName]>>,
    ) => Ga4Event | null;
  },
): Ga4EventMap;

export function ga4(
  _events: unknown,
  mappings: Record<string, Ga4EventMap>,
): Ga4EventMap {
  const byName = new Map(Object.entries(mappings));

  return (event) => byName.get(event.name)?.(event) ?? null;
}
