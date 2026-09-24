import type { Ga4Item } from "src/types/Ga4Item";
import type { RecommendedEventName } from "src/types/RecommendedEventName";

/**
 * The GA4 event a mapping answers for one Trace event.
 *
 * @example
 * ```ts
 * const purchase: Ga4Event = {
 *   name: "purchase",
 *   parameters: { transaction_id: "T_1", value: 49.5, currency: "EUR" },
 *   items: [{ item_id: "sku_1", price: 49.5, quantity: 1 }],
 * };
 * ```
 */
export type Ga4Event = {
  /** Sent as it is; `string & {}` keeps the recommended names as suggestions. */
  name: RecommendedEventName | (string & {});
  /** GA4's parameters are flat; the event's context goes under them. */
  parameters: Record<string, string | number | boolean | null>;
  /** GA4's ecommerce item list, sent as the mapping built it. */
  items?: Ga4Item[];
};
