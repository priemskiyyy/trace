import { ShoppingCart, Trash } from "@phosphor-icons/react";
import type { Receipt } from "@priemskiyyy/trace";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-react";
import { useTrace } from "@priemskiyyy/trace-react";
import type React from "react";

import type { createCart } from "example-shared/boutique/cart/createCart";
import { getCartTotal } from "example-shared/boutique/cart/getCartTotal";
import { createOrderPayload } from "example-shared/boutique/checkout/createOrderPayload";
import { formatMoney } from "example-shared/formatting/formatMoney";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
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
    <Panel title="Cart" icon={ShoppingCart} shows="What you are about to buy.">
      {state.lines.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Add a product below to start a checkout."
        />
      ) : (
        <ul
          aria-label="Cart"
          className="flex flex-col divide-y divide-zinc-200/70 text-sm dark:divide-zinc-800"
        >
          {state.lines.map((line) => (
            <li
              key={line.product.id}
              aria-label={line.product.name}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span>
                {line.product.name} × {line.quantity}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono">
                  {formatMoney(line.product.price * line.quantity)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${line.product.name}`}
                  onClick={() => cart.remove(line.product.id)}
                  className={buttonStyles({ variant: "ghost", size: "small" })}
                >
                  <Trash aria-hidden="true" size={14} weight="bold" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between border-t border-zinc-200/70 pt-3 dark:border-zinc-800">
        <span className="font-semibold">Total</span>
        <span className="font-mono font-semibold">{formatMoney(total)}</span>
      </div>
      <button
        type="button"
        disabled={state.lines.length === 0}
        onClick={handleCheckoutPress}
        className={buttonStyles({ variant: "primary" })}
      >
        Check out
      </button>
    </Panel>
  );
};
