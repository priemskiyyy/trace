import type { Account } from "example-shared/boutique/users/types/Account";
import type { AccountId } from "example-shared/boutique/users/types/AccountId";

/** The two shoppers the tour signs in as, one member and one VIP. */
export const ACCOUNTS: Record<AccountId, Account> = {
  nora: {
    id: "nora",
    name: "Nora Fields",
    email: "nora@example.com",
    plan: "member",
  },
  isabella: {
    id: "isabella",
    name: "Isabella Cruz",
    email: "isabella@example.com",
    plan: "vip",
  },
};

export const ACCOUNT_IDS: AccountId[] = ["nora", "isabella"];
