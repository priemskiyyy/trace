import type { Product } from "example-shared/boutique/catalog/types/Product";
import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";

/** Boutique's whole storefront: three products, priced in US dollars. */
export const PRODUCTS: Record<ProductId, Product> = {
  scarf: { id: "scarf", name: "Silk Scarf", price: 48, currency: "USD" },
  boots: { id: "boots", name: "Suede Boots", price: 128, currency: "USD" },
  tote: { id: "tote", name: "Canvas Tote", price: 36, currency: "USD" },
};

export const PRODUCT_IDS: ProductId[] = ["scarf", "boots", "tote"];
