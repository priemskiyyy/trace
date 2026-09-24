import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

import {
  MAX_DISTINCT_ID_LENGTH,
  MAX_NAME_LENGTH,
} from "src/utils/constants/limits";
import { TIMESTAMP_LOSS, USER_ID_LOSS } from "src/utils/constants/losses";
import { getUmamiData } from "src/utils/getUmamiData";

export const getUmamiEvent = ({
  name,
  properties,
  context,
  identity: { user },
}: TrackedEvent) => {
  const isIdLong = user !== null && user.id.length > MAX_DISTINCT_ID_LENGTH;

  const nameLosses: MappingLoss[] =
    name.length > MAX_NAME_LENGTH
      ? [{ path: "name", reason: "truncated" }]
      : [];

  const { data, losses } = getUmamiData([
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
  ]);

  return {
    name,
    data,
    id: user === null || isIdLong ? undefined : user.id,
    losses: [
      ...nameLosses,
      ...losses,
      TIMESTAMP_LOSS,
      ...(isIdLong ? [USER_ID_LOSS] : []),
    ],
  };
};
