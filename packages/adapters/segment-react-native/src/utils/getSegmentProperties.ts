import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

export const getSegmentProperties = ({
  context,
  properties,
}: TrackedEvent) => ({
  properties: { ...context, ...properties },
  losses: Object.keys(context).flatMap((key): MappingLoss[] => {
    if (!Object.hasOwn(properties, key)) {
      return [];
    }

    return [{ path: `context.${key}`, reason: "omitted" }];
  }),
});
