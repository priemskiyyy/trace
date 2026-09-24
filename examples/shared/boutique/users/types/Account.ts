import type { AccountId } from "example-shared/boutique/users/types/AccountId";

export type Account = {
  id: AccountId;
  name: string;
  initials: string;
  email: string;
  plan: "member" | "vip";
};
