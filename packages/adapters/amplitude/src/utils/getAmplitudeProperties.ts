import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

import { getPropertyValue } from "src/utils/getPropertyValue";

type Mapped = { key: string; kept: unknown[]; losses: MappingLoss[] };

export const getAmplitudeProperties = ({
  properties,
  context,
}: TrackedEvent) => {
  const mapped = [
    ...Object.entries(properties).map(([key, value]): Mapped => ({
      key,
      ...getPropertyValue(value, `properties.${key}`, 2),
    })),
    ...Object.entries(context).map(([key, value]): Mapped => {
      if (Object.hasOwn(properties, key)) {
        return {
          key,
          kept: [],
          losses: [{ path: `context.${key}`, reason: "omitted" }],
        };
      }

      return { key, ...getPropertyValue(value, `context.${key}`, 2) };
    }),
  ];

  return {
    properties: Object.fromEntries(
      mapped.flatMap(({ key, kept }) => kept.map((value) => [key, value])),
    ),
    losses: mapped.flatMap(({ losses }) => losses),
  };
};
