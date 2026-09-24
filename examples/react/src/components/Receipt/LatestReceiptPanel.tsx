import { Receipt } from "@phosphor-icons/react";
import type React from "react";

import type { BoutiqueRuntime } from "example-shared/boutique/reporting/types/BoutiqueRuntime";
import { formatAccount } from "example-shared/formatting/formatAccount";
import { formatClockTime } from "example-shared/formatting/formatClockTime";
import { ReceiptStateBadge } from "src/components/Badge/ReceiptStateBadge";
import { EmptyState } from "src/components/EmptyState/EmptyState";
import { Panel } from "src/components/Panel/Panel";
import { ReceiptDetails } from "src/components/Receipt/ReceiptDetails";
import { useEventLog } from "src/hooks/useEventLog";

type LatestReceiptPanelProps = { runtime: BoutiqueRuntime };

export const LatestReceiptPanel: React.FunctionComponent<
  LatestReceiptPanelProps
> = ({ runtime }) => {
  const [latest] = useEventLog(runtime.receipts);

  return (
    <Panel
      title="Latest receipt"
      icon={Receipt}
      shows="What each of the six destinations did with the last thing you did, on what evidence, and what Trace removed first."
    >
      {latest === undefined ? (
        <EmptyState
          icon={Receipt}
          title="Nothing tracked yet"
          description="Search, view a product or check out. Each one is a single event, and its receipt lands here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{latest.action}</span>
            <ReceiptStateBadge receipt={latest.receipt} />
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {formatAccount(latest.account)} · {formatClockTime(latest.at)}
            </span>
          </div>
          <ReceiptDetails key={latest.receipt.id} tracked={latest} />
        </div>
      )}
    </Panel>
  );
};
