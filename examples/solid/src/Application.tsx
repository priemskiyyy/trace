import type { Receipt } from "@priemskiyyy/trace";
import { TraceDevtools } from "@priemskiyyy/trace-devtools/solid";
import { TraceProvider } from "@priemskiyyy/trace-solid";
import type { Component } from "solid-js";
import { createSignal } from "solid-js";

import { createCart } from "example-shared/boutique/cart/createCart";
import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
import { createTrackedReceipt } from "example-shared/boutique/reporting/createTrackedReceipt";
import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import type { BoutiqueRuntime } from "example-shared/boutique/reporting/types/BoutiqueRuntime";
import type { TrackedReceipt } from "example-shared/boutique/reporting/types/TrackedReceipt";
import { ConsentBanner } from "src/components/Consent/ConsentBanner";
import { PageHeader } from "src/components/PageHeader/PageHeader";
import { CartPanel } from "src/components/Shop/CartPanel";
import { ProductGrid } from "src/components/Shop/ProductGrid";
import { ReceiptPanel } from "src/components/Shop/ReceiptPanel";

type ApplicationProps = { runtime: BoutiqueRuntime };

export const Application: Component<ApplicationProps> = (props) => {
  const cart = createCart();
  const [tracked, setTracked] = createSignal<TrackedReceipt | null>(null);

  const handleAddPress = (productId: ProductId) => {
    cart.add(productId);
  };

  const handleReceipt = (
    receipt: Receipt<BoutiqueDestination>,
    action: string,
  ) => {
    setTracked(
      createTrackedReceipt(props.runtime.trace, {
        receipt,
        action,
        account: null,
      }),
    );
  };

  return (
    <TraceProvider trace={props.runtime.trace}>
      <PageHeader />
      <main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div class="flex max-w-3xl flex-col gap-2">
          <h2 class="text-2xl font-semibold tracking-tight sm:text-3xl">
            Boutique on Solid
          </h2>
          <p class="text-base text-zinc-600 dark:text-zinc-400">
            Add the Suede Boots to your cart and check out. Decline consent
            first and only your own API receives the event; accept it and the
            other five destinations open too. The receipt lists every
            destination, its evidence and its losses.
          </p>
        </div>
        <ConsentBanner />
        <div class="grid items-start gap-4 lg:grid-cols-2">
          <div class="flex flex-col gap-4">
            <ProductGrid onAddPress={handleAddPress} />
            <CartPanel cart={cart} onReceipt={handleReceipt} />
          </div>
          <ReceiptPanel tracked={tracked()} />
        </div>
      </main>
      <TraceDevtools />
    </TraceProvider>
  );
};
