import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

import { MAX_DEPTH, MAX_VALUE_LENGTH } from "src/utils/constants/limits";

export const getAmplitudeProperties = ({
  properties,
  context,
}: TrackedEvent) => {
  const losses: MappingLoss[] = [];
  const sent: Record<string, unknown> = {};

  const getValue = (value: unknown, path: string, layer: number): unknown[] => {
    if (typeof value === "string" && value.length > MAX_VALUE_LENGTH) {
      losses.push({ path, reason: "truncated" });
    }

    if (typeof value !== "object" || value === null) {
      return [value];
    }

    if (layer > MAX_DEPTH) {
      losses.push({ path, reason: "unsupported" });

      return [];
    }

    if (Array.isArray(value)) {
      return [
        value.flatMap((item: unknown, index) =>
          getValue(item, `${path}.${index}`, layer + 1),
        ),
      ];
    }

    return [
      Object.fromEntries(
        Object.entries(value).flatMap(([key, nested]: [string, unknown]) =>
          getValue(nested, `${path}.${key}`, layer + 1).map((kept) => [
            key,
            kept,
          ]),
        ),
      ),
    ];
  };

  for (const [key, value] of Object.entries(properties)) {
    for (const kept of getValue(value, `properties.${key}`, 2)) {
      sent[key] = kept;
    }
  }

  for (const [key, value] of Object.entries(context)) {
    if (Object.hasOwn(properties, key)) {
      losses.push({ path: `context.${key}`, reason: "omitted" });
      continue;
    }

    for (const kept of getValue(value, `context.${key}`, 2)) {
      sent[key] = kept;
    }
  }

  return { properties: sent, losses };
};
