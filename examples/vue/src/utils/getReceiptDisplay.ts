import type { DestinationOutcome, ReceiptStatus } from "@priemskiyyy/trace";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-vue";
import type { Tone } from "example-shared/ui/types/Tone";

export type ReceiptDisplay = {
  tone: Tone;
  label: string;
  reason: string | null;
  outcomes: Partial<
    Record<RegisteredDestinationName, DestinationOutcome | null>
  >;
};

/**
 * A receipt's status, flattened so no branch of the template has to narrow a
 * union: `reason` is set only while dropped, and `outcomes` is always safe to
 * index even though it is empty then.
 */
export const getReceiptDisplay = (
  status: ReceiptStatus<RegisteredDestinationName>,
): ReceiptDisplay => {
  if (status.state === "settled") {
    return {
      tone: "positive",
      label: "Settled",
      reason: null,
      outcomes: status.outcomes,
    };
  }

  if (status.state === "dropped") {
    return {
      tone: "danger",
      label: "Dropped",
      reason: status.reason,
      outcomes: {},
    };
  }

  return {
    tone: "info",
    label: "Sending",
    reason: null,
    outcomes: status.outcomes,
  };
};
