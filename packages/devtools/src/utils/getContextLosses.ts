import type { ContextLoss } from "src/types/internal/ContextLoss";
import { readField } from "src/utils/readField";

export const getContextLosses = (context: unknown): ContextLoss[] => {
  const losses = readField(context, "losses");

  if (!Array.isArray(losses)) {
    return [];
  }

  return losses.flatMap((loss: unknown) => {
    const path = readField(loss, "path");
    const reason = readField(loss, "reason");

    if (typeof path !== "string" || typeof reason !== "string") {
      return [];
    }

    return [{ path, reason }];
  });
};
