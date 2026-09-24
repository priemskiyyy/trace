import {
  PRODUCT_IDS,
  PRODUCTS,
} from "example-shared/boutique/catalog/constants/products";
import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
import { formatMoney } from "example-shared/formatting/formatMoney";
import type React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "src/components/Button/Button";

type ProductGridProps = { onAdd: (productId: ProductId) => void };

export const ProductGrid: React.FunctionComponent<ProductGridProps> = ({
  onAdd,
}) => (
  <View aria-label="Products" style={styles.grid}>
    {PRODUCT_IDS.map((productId) => (
      <View
        aria-label={PRODUCTS[productId].name}
        key={productId}
        style={styles.card}
      >
        <Text style={styles.name}>{PRODUCTS[productId].name}</Text>
        <Text style={styles.price}>
          {formatMoney(PRODUCTS[productId].price)}
        </Text>
        <Button label="Add to cart" onPress={() => onAdd(productId)} />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  grid: { flexDirection: "column", gap: 10 },
  card: {
    flexDirection: "column",
    gap: 6,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e4e4e7",
    backgroundColor: "#ffffff",
  },
  name: { fontSize: 14, fontWeight: "600", color: "#27272a" },
  price: { fontSize: 13, color: "#71717a" },
});
