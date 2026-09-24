import type { Receipt } from "@priemskiyyy/trace";
import { useTrace } from "@priemskiyyy/trace-react";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-react";
import type { createCart } from "example-shared/boutique/cart/createCart";
import { getCartTotal } from "example-shared/boutique/cart/getCartTotal";
import { createOrderPayload } from "example-shared/boutique/checkout/createOrderPayload";
import { formatMoney } from "example-shared/formatting/formatMoney";
import type React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "src/components/Button/Button";
import { EmptyState } from "src/components/EmptyState/EmptyState";
import { Panel } from "src/components/Panel/Panel";
import { useObservable } from "src/hooks/useObservable";

type CartPanelProps = {
  cart: ReturnType<typeof createCart>;
  onCheckout: (
    receipt: Receipt<RegisteredDestinationName>,
    action: string,
  ) => void;
};

export const CartPanel: React.FunctionComponent<CartPanelProps> = ({
  cart,
  onCheckout,
}) => {
  const trace = useTrace();
  const state = useObservable(cart.state);
  const total = getCartTotal(state);

  const handleCheckoutPress = () => {
    trace.track("Checkout Started", {
      cart: { id: state.id },
      value: total,
      currency: "USD",
    });

    const receipt = trace.track(
      "Checkout Completed",
      createOrderPayload(state),
    );

    onCheckout(
      receipt,
      `Buy ${state.lines.length} item${state.lines.length === 1 ? "" : "s"}`,
    );
    cart.clear();
  };

  return (
    <Panel title="Cart" shows="What you are about to buy.">
      {state.lines.length === 0 ? (
        <EmptyState
          title="Your cart is empty"
          description="Add a product above to start a checkout."
        />
      ) : (
        <View aria-label="Cart" style={styles.lines}>
          {state.lines.map((line) => (
            <View
              aria-label={line.product.name}
              key={line.product.id}
              style={styles.line}
            >
              <Text style={styles.lineName}>
                {line.product.name} × {line.quantity}
              </Text>
              <View style={styles.lineActions}>
                <Text style={styles.linePrice}>
                  {formatMoney(line.product.price * line.quantity)}
                </Text>
                <Button
                  label="Remove"
                  onPress={() => cart.remove(line.product.id)}
                  variant="ghost"
                />
              </View>
            </View>
          ))}
        </View>
      )}
      <View style={styles.total}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatMoney(total)}</Text>
      </View>
      <Button
        disabled={state.lines.length === 0}
        label="Check out"
        onPress={handleCheckoutPress}
      />
    </Panel>
  );
};

const styles = StyleSheet.create({
  lines: {
    flexDirection: "column",
    gap: 8,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
  },
  lineName: { fontSize: 13, color: "#3f3f46", flexShrink: 1 },
  lineActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  linePrice: { fontSize: 13, color: "#3f3f46", fontVariant: ["tabular-nums"] },
  total: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
  },
  totalLabel: { fontSize: 14, fontWeight: "600", color: "#27272a" },
  totalValue: { fontSize: 14, fontWeight: "600", color: "#27272a" },
});
