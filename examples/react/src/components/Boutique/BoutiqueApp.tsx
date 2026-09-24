import type { Receipt } from "@priemskiyyy/trace";
import clsx from "clsx";
import type React from "react";

import type { ProductId } from "example-shared/boutique/catalog/types/ProductId";
import type { CartStore } from "example-shared/boutique/cart/types/CartStore";
import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import { ACCOUNTS } from "example-shared/boutique/users/constants/accounts";
import type { AccountId } from "example-shared/boutique/users/types/AccountId";
import type { CrewId } from "example-shared/boutique/users/types/CrewId";
import { CARD_CLASS_NAME } from "example-shared/ui/styles/cardStyles";
import { AccountSwitcher } from "src/components/Boutique/AccountSwitcher";
import { CartSummary } from "src/components/Boutique/CartSummary";
import { ConsentStrip } from "src/components/Boutique/ConsentStrip";
import { CrewSwitcher } from "src/components/Boutique/CrewSwitcher";
import { ProductList } from "src/components/Boutique/ProductList";
import { SearchForm } from "src/components/Boutique/SearchForm";
import { StatusBar } from "src/components/Boutique/StatusBar";

type BoutiqueAppProps = {
  account: AccountId | null;
  crew: CrewId | null;
  cart: CartStore;
  onAccountSelect: (account: AccountId | null) => void;
  onCrewSelect: (crew: CrewId | null) => void;
  onAddPress: (productId: ProductId) => void;
  onReceipt: (receipt: Receipt<BoutiqueDestination>, action: string) => void;
};

const ShopperName: React.FunctionComponent<{ account: AccountId | null }> = ({
  account,
}) => {
  if (account === null) {
    return <span className="text-sm text-zinc-500">Browsing signed out</span>;
  }

  const { name, plan } = ACCOUNTS[account];

  return (
    <span className="text-sm font-semibold">
      {name} <span className="font-normal text-zinc-500">· {plan}</span>
    </span>
  );
};

export const BoutiqueApp: React.FunctionComponent<BoutiqueAppProps> = ({
  account,
  crew,
  cart,
  onAccountSelect,
  onCrewSelect,
  onAddPress,
  onReceipt,
}) => (
  <section
    aria-label="Boutique"
    className={clsx("min-w-0 overflow-hidden", CARD_CLASS_NAME)}
  >
    <header className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <ShopperName account={account} />
        <div className="ml-auto">
          <AccountSwitcher
            account={account}
            onAccountSelect={onAccountSelect}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-zinc-500">Shopping with</span>
        <CrewSwitcher crew={crew} onCrewSelect={onCrewSelect} />
      </div>
    </header>
    <ConsentStrip />
    <div className="flex flex-col gap-4 p-4">
      <SearchForm onReceipt={onReceipt} />
      <ProductList onAddPress={onAddPress} onReceipt={onReceipt} />
    </div>
    <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
      <CartSummary cart={cart} onReceipt={onReceipt} />
    </div>
    <StatusBar />
  </section>
);
