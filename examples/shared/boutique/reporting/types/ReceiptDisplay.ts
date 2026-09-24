import type { DestinationOutcome, DropReason } from "@priemskiyyy/trace";

import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import type { Tone } from "example-shared/ui/types/Tone";

export type ReceiptDisplay = {
  tone: Tone;
  label: string;
  reason: DropReason | null;
  outcomes: Partial<Record<BoutiqueDestination, DestinationOutcome | null>>;
};
