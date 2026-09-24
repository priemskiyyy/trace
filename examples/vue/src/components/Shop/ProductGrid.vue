<script setup lang="ts">
import {
  PRODUCTS,
  PRODUCT_IDS,
} from "example-shared/boutique/catalog/constants/products";
import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
import { formatMoney } from "example-shared/formatting/formatMoney";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { CARD_CLASS_NAME } from "example-shared/ui/styles/cardStyles";

defineProps<{ onAdd: (productId: ProductId) => void }>();
</script>

<template>
  <ul aria-label="Products" class="grid gap-3 sm:grid-cols-3">
    <li
      v-for="productId in PRODUCT_IDS"
      :key="productId"
      :aria-label="PRODUCTS[productId].name"
      :class="`flex flex-col gap-2 p-4 ${CARD_CLASS_NAME}`"
    >
      <h4 class="font-semibold">{{ PRODUCTS[productId].name }}</h4>
      <p class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ formatMoney(PRODUCTS[productId].price) }}
      </p>
      <button
        type="button"
        :class="buttonStyles({ size: 'small' })"
        @click="onAdd(productId)"
      >
        Add to cart
      </button>
    </li>
  </ul>
</template>
