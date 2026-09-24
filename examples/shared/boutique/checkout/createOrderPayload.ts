import type { z } from "zod";

import type { Cart } from "example-shared/boutique/cart/types/Cart";
import { getCartTotal } from "example-shared/boutique/cart/getCartTotal";
import type { checkoutCompletedSchema } from "example-shared/boutique/checkout/checkoutCompletedSchema";
import { LONG_GIFT_NOTE } from "example-shared/boutique/checkout/constants/giftNote";

type OrderPayload = z.input<typeof checkoutCompletedSchema>;

/** The card Boutique charges every order to; the token is redacted by Trace's default privacy. */
export const createOrderPayload = (cart: Cart): OrderPayload => ({
  cart: { id: cart.id },
  total: getCartTotal(cart),
  currency: cart.lines[0]?.product.currency ?? "USD",
  items: cart.lines.map((line) => ({
    productId: line.product.id,
    quantity: line.quantity,
  })),
  payment: {
    method: "card",
    card: { token: "tok_live_51H8xN2eZvKYlo2C", last4: "4242" },
  },
  giftNote: LONG_GIFT_NOTE,
});
