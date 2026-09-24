import type React from "react";

import { DESTINATION_NAMES } from "example-shared/boutique/reporting/constants/destinations";
import { DROP_MEANINGS } from "example-shared/boutique/reporting/constants/labels";
import { getOutcomeLosses } from "example-shared/boutique/reporting/getOutcomeLosses";
import { getReceiptDisplay } from "example-shared/boutique/reporting/getReceiptDisplay";
import { getRemovedFields } from "example-shared/boutique/reporting/getRemovedFields";
import type { TrackedReceipt } from "example-shared/boutique/reporting/types/TrackedReceipt";
import { formatLoss } from "example-shared/formatting/formatLoss";
import { DestinationOutcomeRow } from "src/components/Receipt/DestinationOutcomeRow";
import { RemovedFields } from "src/components/Receipt/RemovedFields";
import { useObservable } from "src/hooks/useObservable";

type ReceiptDetailsProps = { tracked: TrackedReceipt };

export const ReceiptDetails: React.FunctionComponent<ReceiptDetailsProps> = ({
  tracked,
}) => {
  const { reason, outcomes } = getReceiptDisplay(
    useObservable(tracked.receipt.status),
  );

  if (reason !== null) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {DROP_MEANINGS[reason]}
      </p>
    );
  }

  const removed = getRemovedFields(outcomes);
  const removedLosses = new Set(removed.map(formatLoss));

  return (
    <div className="flex flex-col gap-3">
      <RemovedFields removed={removed} />
      <ul
        aria-label="Outcomes"
        className="flex flex-col divide-y divide-zinc-200/70 dark:divide-zinc-800"
      >
        {DESTINATION_NAMES.map((name) => {
          const outcome = outcomes[name];

          return (
            <DestinationOutcomeRow
              key={name}
              name={name}
              outcome={outcome}
              consent={tracked.consent}
              losses={getOutcomeLosses(outcome).flatMap((loss) => {
                if (removedLosses.has(formatLoss(loss))) {
                  return [];
                }

                return [loss];
              })}
            />
          );
        })}
      </ul>
    </div>
  );
};
