import type { ReceiptStatus } from "@priemskiyyy/trace";
import { match } from "ts-pattern";

import { RECEIPT_LABELS } from "example-shared/boutique/reporting/constants/labels";
import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import type { ReceiptDisplay } from "example-shared/boutique/reporting/types/ReceiptDisplay";
import { RECEIPT_TONES } from "example-shared/ui/constants/tones";

/**
 * A receipt's status, flattened so no branch of a template has to narrow a
 * union: `reason` is set only once the receipt is dropped, and `outcomes` is
 * always safe to index, though empty then.
 */
export const getReceiptDisplay = (
  status: ReceiptStatus<BoutiqueDestination>,
): ReceiptDisplay => {
  const tone = RECEIPT_TONES[status.state];
  const label = RECEIPT_LABELS[status.state];

  return match(status)
    .with({ state: "dropped" }, ({ reason }): ReceiptDisplay => ({
      tone,
      label,
      reason,
      outcomes: {},
    }))
    .with({ state: "pending" }, { state: "settled" }, ({ outcomes }) => ({
      tone,
      label,
      reason: null,
      outcomes,
    }))
    .exhaustive();
};
