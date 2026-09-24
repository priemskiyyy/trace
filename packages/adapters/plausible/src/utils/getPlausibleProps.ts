import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

import {
  MAX_NAME_LENGTH,
  MAX_PROPERTIES,
  MAX_VALUE_LENGTH,
} from "src/utils/constants/limits";
import { TIMESTAMP_LOSS } from "src/utils/constants/losses";

export const getPlausibleProps = ({ properties, context }: TrackedEvent) => {
  const props: Record<string, string> = {};
  const losses: MappingLoss[] = [];

  const entries = [
    ...Object.entries(properties).map(([name, value]) => ({
      name,
      value,
      path: `properties.${name}`,
      isShadowed: false,
    })),
    ...Object.entries(context).map(([name, value]) => ({
      name,
      value,
      path: `context.${name}`,
      isShadowed: Object.hasOwn(properties, name),
    })),
  ];

  for (const { name, value, path, isShadowed } of entries) {
    if (isShadowed) {
      losses.push({ path, reason: "omitted" });

      continue;
    }

    if (name.length > MAX_NAME_LENGTH) {
      losses.push({ path, reason: "invalid" });

      continue;
    }

    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      losses.push({ path, reason: "unsupported" });

      continue;
    }

    if (Object.keys(props).length >= MAX_PROPERTIES) {
      losses.push({ path, reason: "truncated" });

      continue;
    }

    if (typeof value !== "string") {
      losses.push({ path, reason: "coerced" });
    }

    const text = String(value);

    if (text.length <= MAX_VALUE_LENGTH) {
      props[name] = text;

      continue;
    }

    losses.push({ path, reason: "truncated" });
    // A cut between the two halves of a surrogate pair would leave half a character.
    props[name] = text
      .slice(0, MAX_VALUE_LENGTH)
      .replace(/[\uD800-\uDBFF]$/, "");
  }

  return { props, losses: [...losses, TIMESTAMP_LOSS] };
};
