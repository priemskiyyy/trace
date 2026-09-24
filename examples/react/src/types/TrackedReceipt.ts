import type { Receipt } from "@priemskiyyy/trace";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-react";

import type { AccountId } from "example-shared/boutique/users/types/AccountId";

export type TrackedReceipt = {
  receipt: Receipt<RegisteredDestinationName>;
  action: string;
  account: AccountId | null;
  at: number;
};
