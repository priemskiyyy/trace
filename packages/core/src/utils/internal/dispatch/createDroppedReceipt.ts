import type { DropReason } from "src/types/DropReason";
import type { Receipt } from "src/types/Receipt";
import type { ReceiptStatus } from "src/types/ReceiptStatus";

const getDroppedStatus = <TName extends string>(
  reason: DropReason,
  issues: { path: string; message: string }[],
): ReceiptStatus<TName> => {
  if (reason !== "invalid") {
    return Object.freeze({ state: "dropped", reason });
  }

  const copied = issues.map(({ path, message }) =>
    Object.freeze({ path, message }),
  );

  Object.freeze(copied);

  return Object.freeze({ state: "dropped", reason, issues: copied });
};

export const createDroppedReceipt = <TName extends string>({
  id,
  reason,
  issues,
}: {
  id: string;
  reason: DropReason;
  issues: { path: string; message: string }[];
}): Receipt<TName> => {
  const status = getDroppedStatus<TName>(reason, issues);

  return Object.freeze({
    id,
    status: Object.freeze({ get: () => status, subscribe: () => () => {} }),
    settled: Promise.resolve(status),
  });
};
