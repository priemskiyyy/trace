import { ShoppingCart, Trash } from "@phosphor-icons/react";
import type { Receipt } from "@priemskiyyy/trace";
import { useTrace } from "@priemskiyyy/trace-react";
import type React from "react";

import { getCartItemCount } from "example-shared/boutique/cart/getCartItemCount";
import { getCartTotal } from "example-shared/boutique/cart/getCartTotal";
import type { CartStore } from "example-shared/boutique/cart/types/CartStore";
import { createOrderPayload } from "example-shared/boutique/checkout/createOrderPayload";
import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import { formatItemCount } from "example-shared/formatting/formatItemCount";
import { formatMoney } from "example-shared/formatting/formatMoney";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { EmptyState } from "src/components/EmptyState/EmptyState";
import { useObservable } from "src/hooks/useObservable";

type CartSummaryProps = {
  cart: CartStore;
  onReceipt: (receipt: Receipt<BoutiqueDestination>, action: string) => void;
};

export const CartSummary: React.FunctionComponent<CartSummaryProps> = ({
  cart,
  onReceipt,
}) => {
  const trace = useTrace();
  const state = useObservable(cart.state);
  const total = getCartTotal(state);
  const items = getCartItemCount(state);

  const handleCheckoutPress = () => {
    trace.track("Checkout Started", {
      cart: { id: state.id },
      value: total,
      currency: "USD",
    });
    onReceipt(
      trace.track("Checkout Completed", createOrderPayload(state)),
      `Check out ${formatItemCount(items)}`,
    );
    cart.clear();
  };

  return (
    <section aria-label="Cart" className="flex flex-col gap-3">
      <h4 className="flex items-center gap-2 font-semibold">
        <ShoppingCart
          aria-hidden="true"
          size={16}
          weight="duotone"
          className="text-violet-600 dark:text-violet-400"
        />
        Cart
      </h4>
      {state.lines.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Add a product above, then check out to send one order to all six destinations."
        />
      ) : (
        <ul
          aria-label="Cart lines"
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
              <span className="flex items-center gap-2">
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
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-zinc-200/70 pt-3 dark:border-zinc-800">
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
    </section>
  );
};
