import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

import { TIMESTAMP_LOSS, VALUE_LOSS } from "src/utils/constants/losses";

export const getFathomEvent = (
  { properties, context }: TrackedEvent,
  cents: number | null,
) => {
  const isWholeCents = cents !== null && Number.isSafeInteger(cents);

  return {
    options: isWholeCents ? { _value: cents } : undefined,
    losses: [
      ...Object.keys(properties).map((key): MappingLoss => ({
        path: `properties.${key}`,
        reason: "unsupported",
      })),
      ...Object.keys(context).map((key): MappingLoss => ({
        path: `context.${key}`,
        reason: "unsupported",
      })),
      TIMESTAMP_LOSS,
      ...(cents === null || isWholeCents ? [] : [VALUE_LOSS]),
    ],
  };
};
