import type { MappingLoss } from "@priemskiyyy/trace";

import { MAX_DEPTH, MAX_PROPERTY_LENGTH } from "src/utils/constants/limits";

export const getPropertyValue = (
  value: unknown,
  path: string,
  layer: number,
): { kept: unknown[]; losses: MappingLoss[] } => {
  if (typeof value === "string") {
    return {
      kept: [value],
      losses:
        value.length > MAX_PROPERTY_LENGTH
          ? [{ path, reason: "truncated" }]
          : [],
    };
  }

  if (typeof value !== "object" || value === null) {
    return { kept: [value], losses: [] };
  }

  if (layer > MAX_DEPTH) {
    return { kept: [], losses: [{ path, reason: "unsupported" }] };
  }

  if (Array.isArray(value)) {
    const items = value.map((item: unknown, index) =>
      getPropertyValue(item, `${path}.${index}`, layer + 1),
    );

    return {
      kept: [items.flatMap(({ kept }) => kept)],
      losses: items.flatMap(({ losses }) => losses),
    };
  }

  const entries = Object.entries(value).map(
    ([key, nested]: [string, unknown]) => ({
      key,
      ...getPropertyValue(nested, `${path}.${key}`, layer + 1),
    }),
  );

  return {
    kept: [
      Object.fromEntries(
        entries.flatMap(({ key, kept }) => kept.map((item) => [key, item])),
      ),
    ],
    losses: entries.flatMap(({ losses }) => losses),
  };
};
