import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

import {
  MAX_NAME_LENGTH,
  MAX_PROPERTIES,
  MAX_PROPERTY_SIZE,
} from "src/utils/constants/limits";
import { getMixpanelValue } from "src/utils/getMixpanelValue";
import { getSentSize } from "src/utils/getSentSize";
import { isOwnedName } from "src/utils/isOwnedName";

export const getMixpanelProperties = (
  { id, properties, context, identity, timestamp }: TrackedEvent,
  anonymousId: string | undefined,
) => {
  const carried: [string, unknown][] = [
    ["time", timestamp],
    ["$insert_id", id],
  ];

  const losses: MappingLoss[] = [];

  if (identity.user !== null) {
    carried.push(["$user_id", identity.user.id]);
  }

  if (anonymousId !== undefined) {
    carried.push(["$device_id", anonymousId]);
  }

  const entries = [
    ...Object.entries(properties).map(([key, value]) => ({
      key,
      value,
      path: `properties.${key}`,
      isShadowed: Object.hasOwn(identity.groups, key),
    })),
    ...Object.entries(context).map(([key, value]) => ({
      key,
      value,
      path: `context.${key}`,
      isShadowed:
        Object.hasOwn(properties, key) || Object.hasOwn(identity.groups, key),
    })),
    ...Object.entries(identity.groups).map(([type, group]) => ({
      key: type,
      value: group.id,
      path: `identity.groups.${type}`,
      isShadowed: false,
    })),
  ];

  for (const { key, value, path, isShadowed } of entries) {
    if (isShadowed || isOwnedName(key)) {
      losses.push({ path, reason: "omitted" });

      continue;
    }

    if (carried.length >= MAX_PROPERTIES) {
      losses.push({ path, reason: "truncated" });

      continue;
    }

    const mapped = getMixpanelValue(value, path, 1, false);

    const isTooLarge =
      typeof mapped.value === "object" &&
      mapped.value !== null &&
      getSentSize(mapped.value) > MAX_PROPERTY_SIZE;

    if (isTooLarge) {
      losses.push({ path, reason: "invalid" });

      continue;
    }

    const isNameCut =
      key.length > MAX_NAME_LENGTH &&
      mapped.losses.every((loss) => loss.path !== path);

    if (isNameCut) {
      losses.push({ path, reason: "truncated" });
    }

    losses.push(...mapped.losses);
    carried.push([key, mapped.value]);
  }

  return { properties: Object.fromEntries(carried), losses };
};
