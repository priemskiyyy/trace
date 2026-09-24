import type { Component } from "solid-js";

import {
  PRODUCTS,
  PRODUCT_IDS,
} from "example-shared/boutique/catalog/constants/products";
import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
import { formatMoney } from "example-shared/formatting/formatMoney";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { CARD_CLASS_NAME } from "example-shared/ui/styles/cardStyles";

type ProductGridProps = { onAddPress: (productId: ProductId) => void };

export const ProductGrid: Component<ProductGridProps> = (props) => (
  <ul aria-label="Products" class="grid gap-3 sm:grid-cols-3">
    {PRODUCT_IDS.map((productId) => {
      const product = PRODUCTS[productId];

      return (
        <li
          aria-label={product.name}
          class={`flex flex-col gap-2 p-4 ${CARD_CLASS_NAME}`}
        >
          <h4 class="font-semibold">{product.name}</h4>
          <p class="text-sm text-zinc-500 dark:text-zinc-400">
            {formatMoney(product.price)}
          </p>
          <button
            type="button"
            class={buttonStyles({ size: "small" })}
            onClick={() => props.onAddPress(productId)}
          >
            Add to cart
          </button>
        </li>
      );
    })}
  </ul>
);
