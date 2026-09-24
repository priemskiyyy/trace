import type { Receipt } from "@priemskiyyy/trace";
import { TraceDevtools } from "@priemskiyyy/trace-devtools/react";
import { TraceProvider } from "@priemskiyyy/trace-react";
import type React from "react";
import { useState } from "react";

import type { OrdersBackend } from "example-shared/backend/types/OrdersBackend";
import { createCart } from "example-shared/boutique/cart/createCart";
import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
import { createBoutiqueRuntime } from "example-shared/boutique/reporting/createBoutiqueRuntime";
import { switchAccount } from "example-shared/boutique/reporting/switchAccount";
import { switchCrew } from "example-shared/boutique/reporting/switchCrew";
import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import type { BoutiqueRuntime } from "example-shared/boutique/reporting/types/BoutiqueRuntime";
import type { AccountId } from "example-shared/boutique/users/types/AccountId";
import type { CrewId } from "example-shared/boutique/users/types/CrewId";
import type { SimulatedProviders } from "example-shared/simulated/types/SimulatedProviders";
import { BoutiqueApp } from "src/components/Boutique/BoutiqueApp";
import { DestinationsPanel } from "src/components/Destinations/DestinationsPanel";
import { Footer } from "src/components/Footer/Footer";
import { Header } from "src/components/Header/Header";
import { Hero } from "src/components/Hero/Hero";
import { LabPanel } from "src/components/Lab/LabPanel";
import { NetworkPanel } from "src/components/Lab/NetworkPanel";
import { LatestReceiptPanel } from "src/components/Receipt/LatestReceiptPanel";
import { ReceiptsPanel } from "src/components/Receipts/ReceiptsPanel";
import { Section } from "src/components/Section/Section";
import { TimelinePanel } from "src/components/Timeline/TimelinePanel";

type ApplicationProps = {
  backend: OrdersBackend;
  providers: SimulatedProviders;
  runtime: BoutiqueRuntime;
};

export const Application: React.FunctionComponent<ApplicationProps> = ({
  backend,
  providers,
  runtime: initialRuntime,
}) => {
  const [account, setAccount] = useState<AccountId | null>(null);
  const [crew, setCrew] = useState<CrewId | null>(null);
  const [cart] = useState(createCart);
  const [runtime, setRuntime] = useState(initialRuntime);

  const handleAccountSelect = (next: AccountId | null) => {
    setAccount(next);
    switchAccount(runtime.trace, next);
  };

  const handleCrewSelect = (next: CrewId | null) => {
    setCrew(next);
    switchCrew(runtime.trace, next);
  };

  const handleAddPress = (productId: ProductId) => {
    cart.add(productId);
  };

  const handleReceipt = (
    receipt: Receipt<BoutiqueDestination>,
    action: string,
  ) => {
    runtime.track(receipt, action, account);
  };

  // A disposed Trace cannot start again, so a restart replaces it and carries the shopper's choices over.
  const handleRestartPress = () => {
    const consent = runtime.trace.consent.get();
    const next = createBoutiqueRuntime({ backend, providers });

    runtime.dispose();
    next.trace.consent.set(consent);

    if (account !== null) {
      switchAccount(next.trace, account);
    }

    if (crew !== null) {
      switchCrew(next.trace, crew);
    }

    next.trace.start();
    setRuntime(next);
  };

  return (
    <TraceProvider trace={runtime.trace}>
      <Header />
      <main className="mx-auto flex max-w-7xl flex-col gap-16 px-4 py-8 sm:px-6">
        <Hero />
        <Section
          id="shop"
          hint="Accept the banner, add the Suede Boots and check out. The receipt beside the shop says what each of the six destinations did with that one event, and what Trace removed before any of them saw it."
        >
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <BoutiqueApp
              account={account}
              crew={crew}
              cart={cart}
              onAccountSelect={handleAccountSelect}
              onCrewSelect={handleCrewSelect}
              onAddPress={handleAddPress}
              onReceipt={handleReceipt}
            />
            <LatestReceiptPanel runtime={runtime} />
          </div>
        </Section>
        <Section
          id="receipts"
          hint="Sign in as Nora Fields and check out, then switch to Isabella Cruz and search. Nora's checkout still says Nora: an event keeps the shopper it was tracked with."
        >
          <ReceiptsPanel runtime={runtime} />
        </Section>
        <Section
          id="destinations"
          hint="Decline the banner, then view a product. Five destinations never get it and every SDK with a switch of its own stops collecting, while your own API still receives it."
        >
          <DestinationsPanel backend={backend} providers={providers} />
        </Section>
        <Section
          id="lab"
          hint="Take your API offline and check out: only Your API fails. Then pick 6 s: its receipt says Unconfirmed, because Trace cannot know whether a request that never answered arrived."
        >
          <div className="grid gap-3 xl:grid-cols-2">
            <LabPanel
              backend={backend}
              providers={providers}
              runtime={runtime}
              onRestartPress={handleRestartPress}
            />
            <NetworkPanel backend={backend} />
          </div>
        </Section>
        <Section
          id="timeline"
          hint="Open the Trace devtools in the corner. They read the same diagnostics as this timeline, and neither ever shows an event's values."
        >
          <TimelinePanel runtime={runtime} />
        </Section>
      </main>
      <Footer />
      <TraceDevtools />
    </TraceProvider>
  );
};
