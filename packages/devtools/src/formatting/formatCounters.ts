import type { TraceSnapshot } from "@priemskiyyy/trace";

export const formatCounters = ({
  identity,
  pendingReceipts,
}: Pick<TraceSnapshot, "identity" | "pendingReceipts">) =>
  `generation #${identity.generation} · ${identity.user?.id ?? "anonymous"} · ${pendingReceipts} pending`;
