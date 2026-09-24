import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

import {
  MAX_NAME_LENGTH,
  MAX_PROPERTIES,
  MAX_PROPERTY_SIZE,
  MAX_STRING_LENGTH,
} from "src/utils/constants/limits";
import { getMixpanelValue } from "src/utils/getMixpanelValue";
import { getSentSize } from "src/utils/getSentSize";
import { isOwnedName } from "src/utils/isOwnedName";

export const getMixpanelProperties = ({
  id,
  name,
  properties,
  context,
  identity,
  timestamp,
}: TrackedEvent) => {
  const carried: Record<string, unknown> = { time: timestamp, $insert_id: id };

  const losses: MappingLoss[] =
    name.length > MAX_STRING_LENGTH
      ? [{ path: "name", reason: "truncated" }]
      : [];

  // set_group registers each membership as a super property, which a property of the same name would replace on this event.
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
  ];

  for (const { key, value, path, isShadowed } of entries) {
    if (isShadowed || isOwnedName(key)) {
      losses.push({ path, reason: "omitted" });

      continue;
    }

    if (Object.keys(carried).length >= MAX_PROPERTIES) {
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
    carried[key] = mapped.value;
  }

  return { properties: carried, losses };
};
