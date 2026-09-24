import type { Receipt } from "@priemskiyyy/trace";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-solid";
import { useTrace } from "@priemskiyyy/trace-solid";
import type { Component } from "solid-js";
import { Show } from "solid-js";

import type { createCart } from "example-shared/boutique/cart/createCart";
import { getCartTotal } from "example-shared/boutique/cart/getCartTotal";
import { createOrderPayload } from "example-shared/boutique/checkout/createOrderPayload";
import { formatMoney } from "example-shared/formatting/formatMoney";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { BasePanel } from "src/components/BasePanel/BasePanel";
import { EmptyState } from "src/components/EmptyState/EmptyState";
import { useObservable } from "src/primitives/useObservable";

type CartPanelProps = {
  cart: ReturnType<typeof createCart>;
  onCheckout: (
    receipt: Receipt<RegisteredDestinationName>,
    action: string,
  ) => void;
};

export const CartPanel: Component<CartPanelProps> = (props) => {
  const trace = useTrace();
  const state = useObservable(props.cart.state);
  const total = () => getCartTotal(state());

  const handleCheckoutClick = () => {
    const cart = state();

    trace().track("Checkout Started", {
      cart: { id: cart.id },
      value: total(),
      currency: "USD",
    });

    const receipt = trace().track(
      "Checkout Completed",
      createOrderPayload(cart),
    );

    props.onCheckout(
      receipt,
      `Buy ${cart.lines.length} item${cart.lines.length === 1 ? "" : "s"}`,
    );
    props.cart.clear();
  };

  return (
    <BasePanel title="Cart" shows="What you are about to buy.">
      <Show
        when={state().lines.length > 0}
        fallback={
          <EmptyState
            title="Your cart is empty"
            description="Add a product below to start a checkout."
          />
        }
      >
        <ul
          aria-label="Cart"
          class="flex flex-col divide-y divide-zinc-200/70 text-sm dark:divide-zinc-800"
        >
          {state().lines.map((line) => (
            <li
              aria-label={line.product.name}
              class="flex items-center justify-between gap-3 py-2"
            >
              <span>
                {line.product.name} × {line.quantity}
              </span>
              <div class="flex items-center gap-2">
                <span class="font-mono">
                  {formatMoney(line.product.price * line.quantity)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${line.product.name}`}
                  class={buttonStyles({ variant: "ghost", size: "small" })}
                  onClick={() => props.cart.remove(line.product.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Show>
      <div class="flex items-center justify-between border-t border-zinc-200/70 pt-3 dark:border-zinc-800">
        <span class="font-semibold">Total</span>
        <span class="font-mono font-semibold">{formatMoney(total())}</span>
      </div>
      <button
        type="button"
        disabled={state().lines.length === 0}
        class={buttonStyles({ variant: "primary" })}
        onClick={handleCheckoutClick}
      >
        Check out
      </button>
    </BasePanel>
  );
};
