<script lang="ts">
  import type { Receipt } from "@priemskiyyy/trace";
  import { useTrace } from "@priemskiyyy/trace-svelte";

  import { getCartItemCount } from "example-shared/boutique/cart/getCartItemCount";
  import { getCartTotal } from "example-shared/boutique/cart/getCartTotal";
  import type { CartStore } from "example-shared/boutique/cart/types/CartStore";
  import { createOrderPayload } from "example-shared/boutique/checkout/createOrderPayload";
  import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
  import { formatItemCount } from "example-shared/formatting/formatItemCount";
  import { formatMoney } from "example-shared/formatting/formatMoney";
  import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
  import BasePanel from "src/components/BasePanel/BasePanel.svelte";
  import EmptyState from "src/components/EmptyState/EmptyState.svelte";
  import { useObservable } from "src/utilities/useObservable.svelte";

  type Props = {
    cart: CartStore;
    onReceipt: (receipt: Receipt<BoutiqueDestination>, action: string) => void;
  };

  let { cart, onReceipt }: Props = $props();

  const trace = useTrace();
  const state = useObservable(() => cart.state);
  const total = $derived(getCartTotal(state.current));

  const handleCheckoutClick = () => {
    const current = state.current;

    trace.current.track("Checkout Started", {
      cart: { id: current.id },
      value: total,
      currency: "USD",
    });

    const receipt = trace.current.track(
      "Checkout Completed",
      createOrderPayload(current),
    );

    onReceipt(
      receipt,
      `Check out ${formatItemCount(getCartItemCount(current))}`,
    );
    cart.clear();
  };
</script>

<BasePanel title="Cart" shows="What you are about to buy.">
  {#if state.current.lines.length === 0}
    <EmptyState
      title="Your cart is empty"
      description="Add a product below to start a checkout."
    />
  {:else}
    <ul
      aria-label="Cart"
      class="flex flex-col divide-y divide-zinc-200/70 text-sm dark:divide-zinc-800"
    >
      {#each state.current.lines as line (line.product.id)}
        <li
          aria-label={line.product.name}
          class="flex items-center justify-between gap-3 py-2"
        >
          <span>{line.product.name} × {line.quantity}</span>
          <div class="flex items-center gap-2">
            <span class="font-mono"
              >{formatMoney(line.product.price * line.quantity)}</span
            >
            <button
              type="button"
              aria-label={`Remove ${line.product.name}`}
              class={buttonStyles({ variant: "ghost", size: "small" })}
              onclick={() => cart.remove(line.product.id)}
            >
              Remove
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
  <div
    class="flex items-center justify-between border-t border-zinc-200/70 pt-3 dark:border-zinc-800"
  >
    <span class="font-semibold">Total</span>
    <span class="font-mono font-semibold">{formatMoney(total)}</span>
  </div>
  <button
    type="button"
    disabled={state.current.lines.length === 0}
    class={buttonStyles({ variant: "primary" })}
    onclick={handleCheckoutClick}
  >
    Check out
  </button>
</BasePanel>
