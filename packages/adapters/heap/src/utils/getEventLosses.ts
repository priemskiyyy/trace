import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

import { TIMESTAMP_LOSS } from "src/utils/constants/losses";
import { getLossReason } from "src/utils/getLossReason";

export const getEventLosses = ({
  properties,
  context,
}: TrackedEvent): MappingLoss[] => [
  ...Object.entries(properties).flatMap(([name, value]): MappingLoss[] => {
    const reason = getLossReason(name, value);

    return reason === null ? [] : [{ path: `properties.${name}`, reason }];
  }),
  ...Object.entries(context).flatMap(([name, value]): MappingLoss[] => {
    if (Object.hasOwn(properties, name)) {
      return [{ path: `context.${name}`, reason: "omitted" }];
    }

    const reason = getLossReason(name, value);

    return reason === null ? [] : [{ path: `context.${name}`, reason }];
  }),
  TIMESTAMP_LOSS,
];
