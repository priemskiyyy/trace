import type { BoutiqueTrace } from "example-shared/boutique/reporting/types/BoutiqueTrace";
import type { TrackedReceipt } from "example-shared/boutique/reporting/types/TrackedReceipt";

/** A receipt as the page lists it, with the consent decision it was tracked under. */
export const createTrackedReceipt = (
  trace: BoutiqueTrace,
  {
    receipt,
    action,
    account,
  }: Pick<TrackedReceipt, "receipt" | "action" | "account">,
): TrackedReceipt => ({
  receipt,
  action,
  account,
  consent: trace.consent.get().analytics,
  at: Date.now(),
});
