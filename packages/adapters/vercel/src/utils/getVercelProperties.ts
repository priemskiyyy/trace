import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";

import { MAX_TEXT_LENGTH } from "src/utils/constants/limits";
import { TIMESTAMP_LOSS } from "src/utils/constants/losses";

export const getVercelProperties = (
  { properties, context }: TrackedEvent,
  maxProperties: number,
) => {
  const sent: Record<string, string | number | boolean | null> = {};
  const losses: MappingLoss[] = [];

  for (const [name, value] of Object.entries(properties)) {
    const path = `properties.${name}`;

    if (name.length > MAX_TEXT_LENGTH) {
      losses.push({ path, reason: "invalid" });

      continue;
    }

    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean" &&
      value !== null
    ) {
      losses.push({ path, reason: "unsupported" });

      continue;
    }

    if (Object.keys(sent).length >= maxProperties) {
      losses.push({ path, reason: "truncated" });

      continue;
    }

    if (typeof value !== "string" || value.length <= MAX_TEXT_LENGTH) {
      sent[name] = value;

      continue;
    }

    losses.push({ path, reason: "truncated" });
    // A cut between the two halves of a surrogate pair would leave half a character.
    sent[name] = value
      .slice(0, MAX_TEXT_LENGTH)
      .replace(/[\uD800-\uDBFF]$/, "");
  }

  return {
    properties: sent,
    losses: [
      ...losses,
      ...Object.keys(context).map((name): MappingLoss => ({
        path: `context.${name}`,
        reason: "omitted",
      })),
      TIMESTAMP_LOSS,
    ],
  };
};
