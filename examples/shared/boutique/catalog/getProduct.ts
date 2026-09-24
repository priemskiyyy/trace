import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
import { PRODUCTS } from "example-shared/boutique/catalog/constants/products";

export const getProduct = (id: ProductId) => PRODUCTS[id];
