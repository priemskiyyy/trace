import type { Receipt } from "@priemskiyyy/trace";
import { TraceProvider } from "@priemskiyyy/trace-react";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-react";
import { createCart } from "example-shared/boutique/cart/createCart";
import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
import type React from "react";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ConsentBanner } from "src/components/Consent/ConsentBanner";
import { Header } from "src/components/Header/Header";
import { CartPanel } from "src/components/Shop/CartPanel";
import { ProductGrid } from "src/components/Shop/ProductGrid";
import { ReceiptPanel } from "src/components/Shop/ReceiptPanel";
import type { BoutiqueRuntime } from "src/types/BoutiqueRuntime";
import type { TrackedReceipt } from "src/types/TrackedReceipt";

type ApplicationProps = { runtime: BoutiqueRuntime };

export const Application: React.FunctionComponent<ApplicationProps> = ({
  runtime,
}) => {
  const [cart] = useState(createCart);
  const [tracked, setTracked] = useState<TrackedReceipt | null>(null);

  const handleAdd = (productId: ProductId) => {
    cart.add(productId);
  };

  const handleCheckout = (
    receipt: Receipt<RegisteredDestinationName>,
    action: string,
  ) => {
    setTracked({ receipt, action, at: Date.now() });
  };

  return (
    <TraceProvider trace={runtime.trace}>
      <View style={styles.root}>
        <Header />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            Add a product to your cart and check out. Decline consent first and
            every destination receives nothing; accept it and PostHog, Firebase,
            Mixpanel and Segment all open.
          </Text>
          <ConsentBanner />
          <ProductGrid onAdd={handleAdd} />
          <CartPanel cart={cart} onCheckout={handleCheckout} />
          <ReceiptPanel tracked={tracked} />
        </ScrollView>
      </View>
    </TraceProvider>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fafafa" },
  content: { flexDirection: "column", gap: 16, padding: 16 },
  intro: { fontSize: 13, color: "#52525b" },
});
