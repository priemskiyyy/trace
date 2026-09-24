import type { Receipt } from "@priemskiyyy/trace";
import { TraceDevtools } from "@priemskiyyy/trace-devtools/solid";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-solid";
import { TraceProvider } from "@priemskiyyy/trace-solid";
import type { Component } from "solid-js";
import { createSignal } from "solid-js";

import { createCart } from "example-shared/boutique/cart/createCart";
import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
import { ConsentBanner } from "src/components/Consent/ConsentBanner";
import { PageHeader } from "src/components/PageHeader/PageHeader";
import { CartPanel } from "src/components/Shop/CartPanel";
import { ProductGrid } from "src/components/Shop/ProductGrid";
import { ReceiptPanel } from "src/components/Shop/ReceiptPanel";
import type { BoutiqueRuntime } from "src/types/BoutiqueRuntime";
import type { TrackedReceipt } from "src/types/TrackedReceipt";

type ApplicationProps = { runtime: BoutiqueRuntime };

export const Application: Component<ApplicationProps> = (props) => {
  const cart = createCart();
  const [tracked, setTracked] = createSignal<TrackedReceipt | null>(null);

  const handleAdd = (productId: ProductId) => {
    cart.add(productId);
  };

  const handleCheckout = (
    receipt: Receipt<RegisteredDestinationName>,
    action: string,
  ) => {
    setTracked({ receipt, action, at: Date.now() });
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
            <ProductGrid onAdd={handleAdd} />
            <CartPanel cart={cart} onCheckout={handleCheckout} />
          </div>
          <ReceiptPanel tracked={tracked()} />
        </div>
      </main>
      <TraceDevtools />
    </TraceProvider>
  );
};
