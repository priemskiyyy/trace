import type { BoutiqueTrace } from "example-shared/boutique/reporting/types/BoutiqueTrace";
import { ACCOUNTS } from "example-shared/boutique/users/constants/accounts";
import type { AccountId } from "example-shared/boutique/users/types/AccountId";

/** What the app does on sign-in, a switch or a sign-out: one call, since Trace plans every destination's identity itself. */
export const switchAccount = (
  trace: BoutiqueTrace,
  accountId: AccountId | null,
) => {
  if (accountId === null) {
    trace.user(null);

    return;
  }

  const account = ACCOUNTS[accountId];

  trace.user({ id: account.id, traits: { plan: account.plan } });
};
