import type { Cart } from "example-shared/boutique/cart/types/Cart";

export const getCartItemCount = (cart: Cart) =>
  cart.lines.reduce((count, line) => count + line.quantity, 0);
