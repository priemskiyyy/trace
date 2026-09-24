import { afterEach, expect, test, vi } from "vitest";

import { createCart } from "example-shared/boutique/cart/createCart";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a runtime without crypto, such as Hermes, still opens a cart and a new one after clearing", () => {
  vi.stubGlobal("crypto", undefined);

  const cart = createCart();
  const first = cart.state.get();

  cart.clear();

  expect(first).toEqual({ id: expect.any(String), lines: [] });
  expect(cart.state.get().id).not.toBe(first.id);
});
