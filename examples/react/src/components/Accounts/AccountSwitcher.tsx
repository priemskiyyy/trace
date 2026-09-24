import { useTrace } from "@priemskiyyy/trace-react";
import type React from "react";

import {
  ACCOUNTS,
  ACCOUNT_IDS,
} from "example-shared/boutique/users/constants/accounts";
import type { AccountId } from "example-shared/boutique/users/types/AccountId";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { switchAccount } from "src/utils/switchAccount";

type AccountSwitcherProps = {
  account: AccountId | null;
  onAccountSelect: (accountId: AccountId | null) => void;
};

export const AccountSwitcher: React.FunctionComponent<AccountSwitcherProps> = ({
  account,
  onAccountSelect,
}) => {
  const trace = useTrace();

  const handleSelect = (next: AccountId | null) => {
    switchAccount(trace, next);
    onAccountSelect(next);
  };

  return (
    <div role="group" aria-label="Account" className="flex flex-wrap gap-2">
      {ACCOUNT_IDS.map((accountId) => (
        <button
          key={accountId}
          type="button"
          aria-pressed={account === accountId}
          onClick={() => handleSelect(accountId)}
          className={buttonStyles({ pressed: account === accountId })}
        >
          {ACCOUNTS[accountId].name}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={account === null}
        onClick={() => handleSelect(null)}
        className={buttonStyles({ pressed: account === null })}
      >
        Sign out
      </button>
    </div>
  );
};
