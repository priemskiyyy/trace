<script setup lang="ts">
import type { Receipt } from "@priemskiyyy/trace";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-vue";
import { useTrace } from "@priemskiyyy/trace-vue";
import { computed } from "vue";

import type { createCart } from "example-shared/boutique/cart/createCart";
import { getCartTotal } from "example-shared/boutique/cart/getCartTotal";
import { createOrderPayload } from "example-shared/boutique/checkout/createOrderPayload";
import { formatMoney } from "example-shared/formatting/formatMoney";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import BasePanel from "src/components/BasePanel/BasePanel.vue";
import EmptyState from "src/components/EmptyState/EmptyState.vue";
import { useObservable } from "src/composables/useObservable";

const props = defineProps<{
  cart: ReturnType<typeof createCart>;
  onCheckout: (
    receipt: Receipt<RegisteredDestinationName>,
    action: string,
  ) => void;
}>();

const trace = useTrace();
const state = useObservable(props.cart.state);
const total = computed(() => getCartTotal(state.value));

const handleCheckoutClick = () => {
  const cart = state.value;

  trace.value.track("Checkout Started", {
    cart: { id: cart.id },
    value: total.value,
    currency: "USD",
  });

  const receipt = trace.value.track(
    "Checkout Completed",
    createOrderPayload(cart),
  );

  props.onCheckout(
    receipt,
    `Buy ${cart.lines.length} item${cart.lines.length === 1 ? "" : "s"}`,
  );
  props.cart.clear();
};
</script>

<template>
  <BasePanel title="Cart" shows="What you are about to buy.">
    <EmptyState
      v-if="state.lines.length === 0"
      title="Your cart is empty"
      description="Add a product below to start a checkout."
    />
    <ul
      v-else
      aria-label="Cart"
      class="flex flex-col divide-y divide-zinc-200/70 text-sm dark:divide-zinc-800"
    >
      <li
        v-for="line in state.lines"
        :key="line.product.id"
        :aria-label="line.product.name"
        class="flex items-center justify-between gap-3 py-2"
      >
        <span>{{ line.product.name }} × {{ line.quantity }}</span>
        <div class="flex items-center gap-2">
          <span class="font-mono">{{
            formatMoney(line.product.price * line.quantity)
          }}</span>
          <button
            type="button"
            :aria-label="`Remove ${line.product.name}`"
            :class="buttonStyles({ variant: 'ghost', size: 'small' })"
            @click="props.cart.remove(line.product.id)"
          >
            Remove
          </button>
        </div>
      </li>
    </ul>
    <div
      class="flex items-center justify-between border-t border-zinc-200/70 pt-3 dark:border-zinc-800"
    >
      <span class="font-semibold">Total</span>
      <span class="font-mono font-semibold">{{ formatMoney(total) }}</span>
    </div>
    <button
      type="button"
      :disabled="state.lines.length === 0"
      :class="buttonStyles({ variant: 'primary' })"
      @click="handleCheckoutClick"
    >
      Check out
    </button>
  </BasePanel>
</template>
