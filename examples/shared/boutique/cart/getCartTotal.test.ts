import { expect, test } from "vitest";

import { getCartTotal } from "example-shared/boutique/cart/getCartTotal";
import { getProduct } from "example-shared/boutique/catalog/getProduct";

test("sums each line's price by its quantity", () => {
  const total = getCartTotal({
    id: "cart_1",
    lines: [
      { product: getProduct("scarf"), quantity: 2 },
      { product: getProduct("boots"), quantity: 1 },
    ],
  });

  expect(total).toBe(48 * 2 + 128);
});

test("an empty cart totals zero", () => {
  expect(getCartTotal({ id: "cart_1", lines: [] })).toBe(0);
});
