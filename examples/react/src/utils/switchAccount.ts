import type { AccountId } from "example-shared/boutique/users/types/AccountId";
import { ACCOUNTS } from "example-shared/boutique/users/constants/accounts";
import type { createBoutiqueTrace } from "src/trace/createBoutiqueTrace";

/** What the app does on sign-in, a switch or a sign-out: one call, since Trace plans every destination's identity itself. */
export const switchAccount = (
  trace: ReturnType<typeof createBoutiqueTrace>,
  accountId: AccountId | null,
) => {
  if (accountId === null) {
    trace.user(null);

    return;
  }

  const account = ACCOUNTS[accountId];

  trace.user({ id: account.id, traits: { plan: account.plan } });
};
