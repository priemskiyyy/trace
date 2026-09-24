import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

import {
  MAX_NAME_LENGTH,
  MAX_PROPERTIES,
  MAX_PROPERTY_SIZE,
} from "src/utils/constants/limits";
import { getMixpanelValue } from "src/utils/getMixpanelValue";
import { getSentSize } from "src/utils/getSentSize";
import { isOwnedName } from "src/utils/isOwnedName";

export const getMixpanelProperties = ({
  id,
  properties,
  context,
  timestamp,
}: TrackedEvent) => {
  const carried: Record<string, unknown> = { time: timestamp, $insert_id: id };
  const losses: MappingLoss[] = [];

  const entries = [
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
      losses.push({ path, reason: "truncated" });

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
