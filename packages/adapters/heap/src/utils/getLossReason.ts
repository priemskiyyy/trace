import type { MappingLoss } from "@priemskiyyy/trace";

import { ARRAY_SEPARATOR, MAX_VALUE_LENGTH } from "src/utils/constants/limits";
import { isPropertyName } from "src/utils/isPropertyName";

export const getLossReason = (
  name: string,
  value: unknown,
): MappingLoss["reason"] | null => {
  if (!isPropertyName(name)) {
    return "invalid";
  }

  if (typeof value === "number") {
    return null;
  }

  // heap.js sends every value as text, and Heap reads numeric text as a number.
  if (typeof value === "boolean") {
    return "coerced";
  }

  if (value === "") {
    return "unsupported";
  }

  if (typeof value === "string") {
    return value.length > MAX_VALUE_LENGTH ? "truncated" : null;
  }

  const isFlatArray =
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean",
    );

  if (!isFlatArray) {
    return "unsupported";
  }

  return value.join(ARRAY_SEPARATOR).length > MAX_VALUE_LENGTH
    ? "truncated"
    : "coerced";
};
