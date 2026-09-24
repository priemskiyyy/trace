import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

import { isReservedKey } from "src/utils/isReservedKey";

export const getPostHogProperties = ({
  properties,
  context,
}: TrackedEvent) => ({
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
    ...Object.keys(properties).flatMap((key): MappingLoss[] => {
      if (!isReservedKey(key)) {
        return [];
      }

      return [{ path: `properties.${key}`, reason: "omitted" }];
    }),
    ...Object.keys(context).flatMap((key): MappingLoss[] => {
      if (!Object.hasOwn(properties, key) && !isReservedKey(key)) {
        return [];
      }

      return [{ path: `context.${key}`, reason: "omitted" }];
    }),
  ],
});
