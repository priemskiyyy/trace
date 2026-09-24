import type { Cart } from "example-shared/boutique/cart/types/Cart";

export const getCartTotal = (cart: Cart) =>
  cart.lines.reduce(
    (total, line) => total + line.product.price * line.quantity,
    0,
  );
