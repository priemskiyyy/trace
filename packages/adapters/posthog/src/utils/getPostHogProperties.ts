import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

import { getCutLosses } from "src/utils/getCutLosses";
import { isReservedKey } from "src/utils/isReservedKey";

export const getPostHogProperties = (
  { name, properties, context }: TrackedEvent,
  maxLength: number,
) => ({
  properties: Object.fromEntries(
    Object.entries({ ...context, ...properties }).flatMap(
      ([key, value]): [string, unknown][] => {
        if (isReservedKey(key)) {
          return [];
        }

        return [[key, value]];
      },
    ),
  ),
  losses: [
    ...getCutLosses(name, "name", maxLength),
    ...Object.entries(properties).flatMap(([key, value]): MappingLoss[] => {
      if (isReservedKey(key)) {
        return [{ path: `properties.${key}`, reason: "omitted" }];
      }

      return getCutLosses(value, `properties.${key}`, maxLength);
    }),
    ...Object.entries(context).flatMap(([key, value]): MappingLoss[] => {
      if (Object.hasOwn(properties, key) || isReservedKey(key)) {
        return [{ path: `context.${key}`, reason: "omitted" }];
      }

      return getCutLosses(value, `context.${key}`, maxLength);
    }),
  ],
});
