import type { MappingLoss } from "@priemskiyyy/trace";

import {
  MAX_OBJECT_PROPERTIES,
  MAX_TEXT_LENGTH,
  NUMBER_PRECISION,
} from "src/utils/constants/limits";

export const getUmamiData = (
  entries: { key: string; value: unknown; path: string; isShadowed: boolean }[],
): { data: Record<string, unknown>; losses: MappingLoss[] } => {
  const data: Record<string, unknown> = {};
  const losses: MappingLoss[] = [];

  for (const { key, value, path, isShadowed } of entries) {
    if (isShadowed) {
      losses.push({ path, reason: "omitted" });

      continue;
    }

    if (Object.keys(data).length >= MAX_OBJECT_PROPERTIES) {
      losses.push({ path, reason: "truncated" });

      continue;
    }

    data[key] = value;

    if (typeof value === "string" && value.length > MAX_TEXT_LENGTH) {
      losses.push({ path, reason: "truncated" });
    }

    if (
      typeof value === "number" &&
      Number(value.toFixed(NUMBER_PRECISION)) !== value
    ) {
      losses.push({ path, reason: "truncated" });
    }

    // Umami stores null and an array as their JSON text, and drops such text when it is too long.
    if (value === null || Array.isArray(value)) {
      losses.push({
        path,
        reason:
          JSON.stringify(value).length > MAX_TEXT_LENGTH
            ? "invalid"
            : "coerced",
      });

      continue;
    }

    if (typeof value !== "object") {
      continue;
    }

    const nested = getUmamiData(
      Object.entries(value).map(
        ([nestedKey, nestedValue]: [string, unknown]) => ({
          key: nestedKey,
          value: nestedValue,
          path: `${path}.${nestedKey}`,
          isShadowed: false,
        }),
      ),
    );

    data[key] = nested.data;
    losses.push(...nested.losses);
  }

  return { data, losses };
};
