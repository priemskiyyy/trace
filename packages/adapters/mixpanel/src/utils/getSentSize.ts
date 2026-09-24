import { MAX_STRING_LENGTH } from "src/utils/constants/limits";

export const getSentSize = (value: unknown) =>
  new TextEncoder().encode(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "string" ? item.slice(0, MAX_STRING_LENGTH) : item,
    ),
  ).length;
