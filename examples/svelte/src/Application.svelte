<script lang="ts">
  import type { Receipt } from "@priemskiyyy/trace";
  import type { RegisteredDestinationName } from "@priemskiyyy/trace-svelte";
  import { TraceProvider } from "@priemskiyyy/trace-svelte";

  import { createCart } from "example-shared/boutique/cart/createCart";
  import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
  import ConsentBanner from "src/components/Consent/ConsentBanner.svelte";
  import TraceDevtoolsHost from "src/components/Devtools/TraceDevtoolsHost.svelte";
  import PageHeader from "src/components/PageHeader/PageHeader.svelte";
  import CartPanel from "src/components/Shop/CartPanel.svelte";
  import ProductGrid from "src/components/Shop/ProductGrid.svelte";
  import ReceiptPanel from "src/components/Shop/ReceiptPanel.svelte";
  import type { BoutiqueRuntime } from "src/types/BoutiqueRuntime";
  import type { TrackedReceipt } from "src/types/TrackedReceipt";

  type Props = { runtime: BoutiqueRuntime };

  let { runtime }: Props = $props();
  const cart = createCart();
  let tracked = $state<TrackedReceipt | null>(null);

  const handleAdd = (productId: ProductId) => {
    cart.add(productId);
  };

  const handleCheckout = (
    receipt: Receipt<RegisteredDestinationName>,
    action: string,
  ) => {
    tracked = { receipt, action, at: Date.now() };
  };
</script>

<TraceProvider trace={runtime.trace}>
  <PageHeader />
  <main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
    <div class="flex max-w-3xl flex-col gap-2">
      <h2 class="text-2xl font-semibold tracking-tight sm:text-3xl">
        Boutique on Svelte
      </h2>
      <p class="text-base text-zinc-600 dark:text-zinc-400">
        Add the Suede Boots to your cart and check out. Decline consent first
        and only your own API receives the event; accept it and the other five
        destinations open too. The receipt lists every destination, its evidence
        and its losses.
      </p>
    </div>
    <ConsentBanner />
    <div class="grid items-start gap-4 lg:grid-cols-2">
      <div class="flex flex-col gap-4">
        <ProductGrid onAdd={handleAdd} />
        <CartPanel {cart} onCheckout={handleCheckout} />
      </div>
      <ReceiptPanel {tracked} />
    </div>
  </main>
  <TraceDevtoolsHost />
</TraceProvider>
