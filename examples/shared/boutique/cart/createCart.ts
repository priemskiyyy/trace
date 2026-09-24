import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
import { getProduct } from "example-shared/boutique/catalog/getProduct";
import type { Cart } from "example-shared/boutique/cart/types/Cart";
import { createValueStore } from "example-shared/utils/createValueStore";

/** A cart held in the page: add and remove products, and check out to start a new one. */
export const createCart = () => {
  let carts = 0;

  const createEmptyCart = (): Cart => {
    carts += 1;

    return { id: `cart_${carts}`, lines: [] };
  };

  const state = createValueStore(createEmptyCart());

  const add = (productId: ProductId) => {
    const cart = state.get();
    const existing = cart.lines.find((line) => line.product.id === productId);

    if (existing === undefined) {
      state.set({
        ...cart,
        lines: [...cart.lines, { product: getProduct(productId), quantity: 1 }],
      });

      return;
    }

    state.set({
      ...cart,
      lines: cart.lines.map((line) =>
        line.product.id === productId
          ? { ...line, quantity: line.quantity + 1 }
          : line,
      ),
    });
  };

  const remove = (productId: ProductId) => {
    const cart = state.get();

    state.set({
      ...cart,
      lines: cart.lines.filter((line) => line.product.id !== productId),
    });
  };

  const clear = () => {
    state.set(createEmptyCart());
  };

  return { state, add, remove, clear };
};
