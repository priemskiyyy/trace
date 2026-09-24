import { MagnifyingGlass } from "@phosphor-icons/react";
import { useTrace } from "@priemskiyyy/trace-react";
import clsx from "clsx";
import type React from "react";

import {
  PRODUCTS,
  PRODUCT_IDS,
} from "example-shared/boutique/catalog/constants/products";
import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
import { formatMoney } from "example-shared/formatting/formatMoney";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { CARD_CLASS_NAME } from "example-shared/ui/styles/cardStyles";

const SEARCH_TERMS = ["boots", "scarf", "gift"];

type ProductGridProps = { onAdd: (productId: ProductId) => void };

export const ProductGrid: React.FunctionComponent<ProductGridProps> = ({
  onAdd,
}) => {
  const trace = useTrace();

  const handleSearchPress = (query: string) => {
    trace.track("Search Performed", { query });
  };

  const handleViewPress = (productId: ProductId) => {
    trace.track("Product Viewed", { product: PRODUCTS[productId] });
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Quick search"
        className="flex flex-wrap gap-2"
      >
        {SEARCH_TERMS.map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => handleSearchPress(term)}
            className={buttonStyles({ size: "small" })}
          >
            <MagnifyingGlass aria-hidden="true" size={14} weight="bold" />
            {term}
          </button>
        ))}
      </div>
      <ul aria-label="Products" className="grid gap-3 sm:grid-cols-3">
        {PRODUCT_IDS.map((productId) => {
          const product = PRODUCTS[productId];

          return (
            <li
              key={productId}
              aria-label={product.name}
              className={clsx("flex flex-col gap-2 p-4", CARD_CLASS_NAME)}
            >
              <h4 className="font-semibold">{product.name}</h4>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {formatMoney(product.price)}
              </p>
              <div className="mt-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => handleViewPress(productId)}
                  className={buttonStyles({ variant: "ghost", size: "small" })}
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => onAdd(productId)}
                  className={buttonStyles({ size: "small" })}
                >
                  Add to cart
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
