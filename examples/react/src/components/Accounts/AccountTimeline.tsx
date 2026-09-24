import { Clock } from "@phosphor-icons/react";
import type React from "react";

import { ACCOUNTS } from "example-shared/boutique/users/constants/accounts";
import type { AccountId } from "example-shared/boutique/users/types/AccountId";
import { formatClockTime } from "example-shared/formatting/formatClockTime";
import { EmptyState } from "src/components/EmptyState/EmptyState";
import { Panel } from "src/components/Panel/Panel";
import { useEventLog } from "src/hooks/useEventLog";
import type { BoutiqueRuntime } from "src/types/BoutiqueRuntime";

type AccountTimelineProps = {
  runtime: BoutiqueRuntime;
  account: AccountId | null;
};

const nameOf = (account: AccountId | null) =>
  account === null ? "anonymous" : ACCOUNTS[account].name;

export const AccountTimeline: React.FunctionComponent<AccountTimelineProps> = ({
  runtime,
  account,
}) => {
  const receipts = useEventLog(runtime.receipts);

  return (
    <Panel
      title="Account timeline"
      icon={Clock}
      shows="Every event tracked so far, each still under the account that made it."
    >
      {receipts.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Nothing tracked yet"
          description="Shop as a signed-in account, then switch, to see each event keep its own account."
        />
      ) : (
        <ul
          aria-label="Account timeline"
          className="flex flex-col divide-y divide-zinc-200/70 text-sm dark:divide-zinc-800"
        >
          {receipts.map((tracked) => (
            <li
              key={tracked.receipt.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span>{tracked.action}</span>
              <span className="font-mono text-xs text-zinc-500">
                {nameOf(tracked.account)} · {formatClockTime(tracked.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Signed in now: {nameOf(account)}.
      </p>
    </Panel>
  );
};
