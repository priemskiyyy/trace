import { CaretRight } from "@phosphor-icons/react";
import type { Receipt } from "@priemskiyyy/trace";
import type React from "react";

import {
  DESTINATION_GUIDES,
  DESTINATION_NAMES,
} from "example-shared/boutique/reporting/constants/destinations";
import { OUTCOME_LABELS } from "example-shared/boutique/reporting/constants/labels";
import { getOutcomeStatus } from "example-shared/boutique/reporting/getOutcomeStatus";
import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import type { TrackedReceipt } from "example-shared/boutique/reporting/types/TrackedReceipt";
import { formatAccount } from "example-shared/formatting/formatAccount";
import { formatClockTime } from "example-shared/formatting/formatClockTime";
import { formatShortId } from "example-shared/formatting/formatShortId";
import { OUTCOME_TONES } from "example-shared/ui/constants/tones";
import { Badge } from "src/components/Badge/Badge";
import { OutcomeIcon } from "src/components/Badge/OutcomeIcon";
import { ReceiptStateBadge } from "src/components/Badge/ReceiptStateBadge";
import { ReceiptDetails } from "src/components/Receipt/ReceiptDetails";
import { useObservable } from "src/hooks/useObservable";

type ReceiptRowProps = { tracked: TrackedReceipt };

const RoutedDestinations: React.FunctionComponent<{
  receipt: Receipt<BoutiqueDestination>;
}> = ({ receipt }) => {
  const status = useObservable(receipt.status);

  if (status.state === "dropped") {
    return null;
  }

  return (
    <span className="flex flex-wrap gap-1.5">
      {DESTINATION_NAMES.flatMap((name) => {
        const outcome = getOutcomeStatus(status.outcomes[name]);

        if (outcome === "not-routed") {
          return [];
        }

        return [
          <Badge key={name} tone={OUTCOME_TONES[outcome]}>
            <OutcomeIcon status={outcome} />
            {DESTINATION_GUIDES[name].name}
            <span className="sr-only">: {OUTCOME_LABELS[outcome]}</span>
          </Badge>,
        ];
      })}
    </span>
  );
};

export const ReceiptRow: React.FunctionComponent<ReceiptRowProps> = ({
  tracked,
}) => (
  <li>
    <details className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg px-2 py-3 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50 [&::-webkit-details-marker]:hidden">
        <CaretRight
          aria-hidden="true"
          size={14}
          weight="bold"
          className="shrink-0 text-zinc-400 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        <span className="font-semibold">{tracked.action}</span>
        <ReceiptStateBadge receipt={tracked.receipt} />
        <span className="text-sm text-zinc-500">
          {formatAccount(tracked.account)} · {formatClockTime(tracked.at)} ·{" "}
          <span className="font-mono">{formatShortId(tracked.receipt.id)}</span>
        </span>
        <span className="flex w-full pl-5 lg:ml-auto lg:w-auto lg:pl-0">
          <RoutedDestinations receipt={tracked.receipt} />
        </span>
      </summary>
      <div className="px-2 pb-4 sm:pl-7">
        <ReceiptDetails tracked={tracked} />
      </div>
    </details>
  </li>
);
