import type { Receipt } from "@priemskiyyy/trace";
import { TraceDevtools } from "@priemskiyyy/trace-devtools/react";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-react";
import { TraceProvider } from "@priemskiyyy/trace-react";
import type React from "react";
import { useState } from "react";

import { createCart } from "example-shared/boutique/cart/createCart";
import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
import type { AccountId } from "example-shared/boutique/users/types/AccountId";
import type { CrewId } from "example-shared/boutique/users/types/CrewId";
import { AccountSwitcher } from "src/components/Accounts/AccountSwitcher";
import { AccountTimeline } from "src/components/Accounts/AccountTimeline";
import { CollectionPanel } from "src/components/Consent/CollectionPanel";
import { ConsentBanner } from "src/components/Consent/ConsentBanner";
import { Footer } from "src/components/Footer/Footer";
import { Header } from "src/components/Header/Header";
import { Hero } from "src/components/Hero/Hero";
import { DestinationsPanel } from "src/components/Lab/DestinationsPanel";
import { LabPanel } from "src/components/Lab/LabPanel";
import { NetworkPanel } from "src/components/Lab/NetworkPanel";
import { CartPanel } from "src/components/Shop/CartPanel";
import { ProductGrid } from "src/components/Shop/ProductGrid";
import { ReceiptPanel } from "src/components/Shop/ReceiptPanel";
import { Section } from "src/components/Section/Section";
import { TeamPanel } from "src/components/Teams/TeamPanel";
import { TimelinePanel } from "src/components/Timeline/TimelinePanel";
import type { BoutiqueRuntime } from "src/types/BoutiqueRuntime";

type ApplicationProps = { runtime: BoutiqueRuntime };

export const Application: React.FunctionComponent<ApplicationProps> = ({
  runtime,
}) => {
  const [account, setAccount] = useState<AccountId | null>(null);
  const [crew, setCrew] = useState<CrewId | null>(null);
  const [cart] = useState(() => createCart());

  const handleAddPress = (productId: ProductId) => {
    cart.add(productId);
  };

  const handleCheckout = (
    receipt: Receipt<RegisteredDestinationName>,
    action: string,
  ) => {
    runtime.track(receipt, action, account);
  };

  return (
    <TraceProvider trace={runtime.trace}>
      <Header />
      <main className="mx-auto flex max-w-7xl flex-col gap-16 px-4 py-8 sm:px-6">
        <Hero />
        <Section
          id="shop"
          hint="Add the Suede Boots to your cart and check out. The receipt beside it shows what each of the six destinations did with the same event, with its evidence and losses."
        >
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <ProductGrid onAdd={handleAddPress} />
              <CartPanel cart={cart} onCheckout={handleCheckout} />
            </div>
            <ReceiptPanel runtime={runtime} />
          </div>
        </Section>
        <Section
          id="accounts"
          hint="Sign in as Nora Fields and check out, then switch to Isabella Cruz. The account timeline keeps Nora's event under Nora, even after the switch."
        >
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <AccountSwitcher account={account} onAccountSelect={setAccount} />
            <AccountTimeline runtime={runtime} account={account} />
          </div>
        </Section>
        <Section
          id="teams"
          hint="Join the Night Market Crew, then switch to the Boardwalk Regulars. Segment carries the membership as its one group; the rest do not have one."
        >
          <TeamPanel crew={crew} onCrewSelect={setCrew} />
        </Section>
        <Section
          id="consent"
          hint="Check out while consent is still unknown: five destinations receive nothing. Accept, then check out again, and watch each one's own switch turn on below."
        >
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <ConsentBanner />
            <CollectionPanel runtime={runtime} />
          </div>
        </Section>
        <Section
          id="lab"
          hint="Segment starts uninitialized, so a checkout skips it until you turn it on and press Retry start. Turn on PostHog filters everything instead, and only PostHog's outcome turns dropped."
        >
          <div className="grid gap-3 xl:grid-cols-2">
            <LabPanel runtime={runtime} />
            <NetworkPanel backend={runtime.backend} />
          </div>
          <DestinationsPanel runtime={runtime} />
        </Section>
        <Section
          id="timeline"
          hint="Open the Trace devtools in the corner. Its timeline lists the same accepted events and outcomes this panel does, live."
        >
          <TimelinePanel runtime={runtime} />
        </Section>
      </main>
      <Footer />
      <TraceDevtools />
    </TraceProvider>
  );
};
