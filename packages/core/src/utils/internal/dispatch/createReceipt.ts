import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { Receipt } from "src/types/Receipt";
import type { ReceiptStatus } from "src/types/ReceiptStatus";
import { createDeferred } from "src/utils/common/createDeferred";
import { ValueStore } from "src/utils/common/ValueStore";

const hasAllOutcomes = <TName extends string>(
  outcomes: Partial<Record<TName, DestinationOutcome | null>>,
): outcomes is Partial<Record<TName, DestinationOutcome>> =>
  Object.values(outcomes).every((outcome) => outcome !== null);

const getReceiptStatus = <TName extends string>(
  outcomes: Partial<Record<TName, DestinationOutcome | null>>,
): ReceiptStatus<TName> => {
  Object.freeze(outcomes);

  if (hasAllOutcomes(outcomes)) {
    return Object.freeze({ state: "settled", outcomes });
  }

  return Object.freeze({ state: "pending", outcomes });
};

export const createReceipt = <TName extends string>({
  id,
  destinations,
  onSettled = () => {},
}: {
  id: string;
  destinations: TName[];
  onSettled?: () => void;
}) => {
  // A null prototype, so a destination named __proto__ stays an own key.
  const unanswered: Partial<Record<TName, DestinationOutcome | null>> =
    Object.create(null);

  for (const name of destinations) {
    unanswered[name] = null;
  }

  const initial = getReceiptStatus(unanswered);
  const status = new ValueStore(initial);
  const completion = createDeferred<ReceiptStatus<TName>>();

  if (initial.state === "settled") {
    onSettled();
    completion.resolve(initial);
  }

  const receipt: Receipt<TName> = Object.freeze({
    id,
    status: Object.freeze({
      get: status.get,
      subscribe: (listener: () => void) =>
        status.get().state === "settled"
          ? () => {}
          : status.subscribe(listener),
    }),
    settled: completion.promise,
  });

  const land = (name: TName, outcome: DestinationOutcome) => {
    const current = status.get();

    if (current.state !== "pending" || current.outcomes[name] !== null) {
      return;
    }

    const next = getReceiptStatus({
      ...current.outcomes,
      [name]: Object.freeze(outcome),
    });

    if (next.state === "settled") {
      onSettled();
    }

    status.set(next);

    if (next.state === "settled") {
      completion.resolve(next);
    }
  };

  return { receipt, land };
};
