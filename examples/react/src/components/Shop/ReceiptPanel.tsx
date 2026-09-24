import { Receipt as ReceiptIcon } from "@phosphor-icons/react";
import type React from "react";

import { Badge } from "src/components/Badge/Badge";
import { DestinationOutcomeRow } from "src/components/Shop/DestinationOutcomeRow";
import { EmptyState } from "src/components/EmptyState/EmptyState";
import { Panel } from "src/components/Panel/Panel";
import { useEventLog } from "src/hooks/useEventLog";
import { useObservable } from "src/hooks/useObservable";
import type { TrackedReceipt } from "src/types/TrackedReceipt";
import { DESTINATION_NAMES } from "src/utils/constants/destinations";
import type { BoutiqueRuntime } from "src/types/BoutiqueRuntime";

type LatestReceiptProps = { tracked: TrackedReceipt };

const LatestReceipt: React.FunctionComponent<LatestReceiptProps> = ({
  tracked,
}) => {
  const status = useObservable(tracked.receipt.status);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {tracked.action} · {tracked.account ?? "anonymous"}
        </span>
        {status.state === "settled" ? (
          <Badge tone="positive">Settled</Badge>
        ) : status.state === "dropped" ? (
          <Badge tone="danger">Dropped</Badge>
        ) : (
          <Badge tone="info">Sending</Badge>
        )}
      </div>
      {status.state === "dropped" ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Dropped before it reached any destination: {status.reason}.
        </p>
      ) : (
        <ul
          aria-label="Destinations"
          className="flex flex-col divide-y divide-zinc-200/70 dark:divide-zinc-800"
        >
          {DESTINATION_NAMES.map((name) => (
            <DestinationOutcomeRow
              key={name}
              name={name}
              outcome={status.outcomes[name]}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

type ReceiptPanelProps = { runtime: BoutiqueRuntime };

export const ReceiptPanel: React.FunctionComponent<ReceiptPanelProps> = ({
  runtime,
}) => {
  const receipts = useEventLog(runtime.receipts);
  const [latest] = receipts;

  return (
    <Panel
      title="Latest receipt"
      icon={ReceiptIcon}
      shows="What every destination did with the last event you tracked, with its evidence and losses."
    >
      {latest === undefined ? (
        <EmptyState
          icon={ReceiptIcon}
          title="Nothing tracked yet"
          description="Add a product to the cart and check out to see a receipt."
        />
      ) : (
        <LatestReceipt tracked={latest} />
      )}
    </Panel>
  );
};
