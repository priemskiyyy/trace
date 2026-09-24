import { Eraser, Receipt } from "@phosphor-icons/react";
import type React from "react";

import type { BoutiqueRuntime } from "example-shared/boutique/reporting/types/BoutiqueRuntime";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { EmptyState } from "src/components/EmptyState/EmptyState";
import { Panel } from "src/components/Panel/Panel";
import { OutcomeLegend } from "src/components/Receipt/OutcomeLegend";
import { ReceiptRow } from "src/components/Receipts/ReceiptRow";
import { useEventLog } from "src/hooks/useEventLog";

type ReceiptsPanelProps = { runtime: BoutiqueRuntime };

export const ReceiptsPanel: React.FunctionComponent<ReceiptsPanelProps> = ({
  runtime,
}) => {
  const receipts = useEventLog(runtime.receipts);

  return (
    <Panel
      title="Receipts"
      icon={Receipt}
      shows="Every event, newest first, under the shopper it was tracked with. Open one to see what each destination answered."
      aside={
        <button
          type="button"
          disabled={receipts.length === 0}
          onClick={runtime.receipts.clear}
          className={buttonStyles({ size: "small" })}
        >
          <Eraser aria-hidden="true" size={14} weight="bold" />
          Clear
        </button>
      }
    >
      {receipts.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No receipts yet"
          description="Every search, view and checkout stays listed here, so you can compare two shoppers side by side."
        />
      ) : (
        <ol
          aria-label="Receipts"
          className="flex max-h-[36rem] flex-col divide-y divide-zinc-200/70 overflow-y-auto dark:divide-zinc-800"
        >
          {receipts.map((tracked) => (
            <ReceiptRow key={tracked.receipt.id} tracked={tracked} />
          ))}
        </ol>
      )}
      <OutcomeLegend />
    </Panel>
  );
};
