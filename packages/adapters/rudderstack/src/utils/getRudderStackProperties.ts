import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

import { RESERVED_PROPERTIES } from "src/utils/constants/properties";
import { getNullPaths } from "src/utils/getNullPaths";

export const getRudderStackProperties = ({
  properties,
  context,
}: TrackedEvent) => {
  const sent: Record<string, unknown> = {};
  const losses: MappingLoss[] = [];

  const entries = [
    ...Object.entries(properties).map(([key, value]) => ({
      key,
      value,
      path: `properties.${key}`,
      isShadowed: false,
    })),
    ...Object.entries(context).map(([key, value]) => ({
      key,
      value,
      path: `context.${key}`,
      isShadowed: Object.hasOwn(properties, key),
    })),
  ];

  for (const { key, value, path, isShadowed } of entries) {
    if (isShadowed) {
      losses.push({ path, reason: "omitted" });

      continue;
    }

    if (RESERVED_PROPERTIES.includes(key.toLowerCase())) {
      losses.push({ path, reason: "invalid" });

      continue;
    }

    sent[key] = value;
    losses.push(
      ...getNullPaths(value, path).map((nullPath): MappingLoss => ({
        path: nullPath,
        reason: "unsupported",
      })),
    );
  }

  return { properties: sent, losses };
};
