import type { Receipt } from "@priemskiyyy/trace";
import type React from "react";

import { RECEIPT_LABELS } from "example-shared/boutique/reporting/constants/labels";
import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import { RECEIPT_TONES } from "example-shared/ui/constants/tones";
import { Badge } from "src/components/Badge/Badge";
import { useObservable } from "src/hooks/useObservable";

type ReceiptStateBadgeProps = { receipt: Receipt<BoutiqueDestination> };

export const ReceiptStateBadge: React.FunctionComponent<
  ReceiptStateBadgeProps
> = ({ receipt }) => {
  const { state } = useObservable(receipt.status);

  return <Badge tone={RECEIPT_TONES[state]}>{RECEIPT_LABELS[state]}</Badge>;
};
