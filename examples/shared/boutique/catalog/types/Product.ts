import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";

export type Product = {
  id: ProductId;
  name: string;
  price: number;
  currency: string;
};
