<script lang="ts">
  import {
    PRODUCTS,
    PRODUCT_IDS,
  } from "example-shared/boutique/catalog/constants/products";
  import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
  import { formatMoney } from "example-shared/formatting/formatMoney";
  import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
  import { CARD_CLASS_NAME } from "example-shared/ui/styles/cardStyles";

  type Props = { onAddPress: (productId: ProductId) => void };

  let { onAddPress }: Props = $props();
</script>

<ul aria-label="Products" class="grid gap-3 sm:grid-cols-3">
  {#each PRODUCT_IDS as productId (productId)}
    {@const product = PRODUCTS[productId]}
    <li
      aria-label={product.name}
      class="flex flex-col gap-2 p-4 {CARD_CLASS_NAME}"
    >
      <h4 class="font-semibold">{product.name}</h4>
      <p class="text-sm text-zinc-500 dark:text-zinc-400">
        {formatMoney(product.price)}
      </p>
      <button
        type="button"
        class={buttonStyles({ size: "small" })}
        onclick={() => onAddPress(productId)}
      >
        Add to cart
      </button>
    </li>
  {/each}
</ul>
