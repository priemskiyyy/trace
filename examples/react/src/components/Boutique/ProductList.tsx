import { Eye, Plus } from "@phosphor-icons/react";
import type { Receipt } from "@priemskiyyy/trace";
import { useTrace } from "@priemskiyyy/trace-react";
import type React from "react";

import {
  PRODUCT_IDS,
  PRODUCTS,
} from "example-shared/boutique/catalog/constants/products";
import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import { formatMoney } from "example-shared/formatting/formatMoney";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";

type ProductListProps = {
  onAddPress: (productId: ProductId) => void;
  onReceipt: (receipt: Receipt<BoutiqueDestination>, action: string) => void;
};

export const ProductList: React.FunctionComponent<ProductListProps> = ({
  onAddPress,
  onReceipt,
}) => {
  const trace = useTrace();

  const handleViewPress = (productId: ProductId) => {
    const product = PRODUCTS[productId];

    onReceipt(
      trace.track("Product Viewed", { product }),
      `View ${product.name}`,
    );
  };

  return (
    <ul
      aria-label="Products"
      className="flex flex-col divide-y divide-zinc-200/70 dark:divide-zinc-800"
    >
      {PRODUCT_IDS.map((productId) => {
        const product = PRODUCTS[productId];

        return (
          <li
            key={productId}
            aria-label={product.name}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <h4 className="font-semibold">{product.name}</h4>
              <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
                {formatMoney(product.price)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleViewPress(productId)}
                className={buttonStyles({ variant: "ghost", size: "small" })}
              >
                <Eye aria-hidden="true" size={14} weight="bold" />
                View
              </button>
              <button
                type="button"
                onClick={() => onAddPress(productId)}
                className={buttonStyles({ size: "small" })}
              >
                <Plus aria-hidden="true" size={14} weight="bold" />
                Add to cart
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
};
