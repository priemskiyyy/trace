import { event } from "@priemskiyyy/trace";

import { checkoutCompletedSchema } from "example-shared/boutique/checkout/checkoutCompletedSchema";

/** Boutique's whole event registry: what every destination in the tour can receive. */
export const events = {
  "Storefront Opened": event(),
  "Product Viewed": event<{
    product: { id: string; name: string; price: number };
  }>(),
  "Search Performed": event<{ query: string }>(),
  "Checkout Started": event<{
    cart: { id: string };
    value: number;
    currency: string;
  }>(),
  "Checkout Completed": event(checkoutCompletedSchema),
};
