import type { ConsentDecision, Receipt } from "@priemskiyyy/trace";

import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import type { AccountId } from "example-shared/boutique/users/types/AccountId";

export type TrackedReceipt = {
  receipt: Receipt<BoutiqueDestination>;
  action: string;
  account: AccountId | null;
  consent: ConsentDecision;
  at: number;
};
