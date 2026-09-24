import { MAX_USER_PROPERTY_LENGTH } from "src/utils/constants/limits";
import { isPropertyName } from "src/utils/isPropertyName";

export const getUserProperties = (set: Record<string, unknown>) => {
  const kept = Object.entries(set).flatMap(
    ([name, value]): [string, unknown][] => {
      const isKept =
        typeof value === "number" ||
        typeof value === "boolean" ||
        (typeof value === "string" &&
          value !== "" &&
          value.length <= MAX_USER_PROPERTY_LENGTH);

      if (!isPropertyName(name) || !isKept) {
        return [];
      }

      return [[name, value]];
    },
  );

  return {
    properties: Object.fromEntries(kept),
    isComplete: kept.length === Object.keys(set).length,
  };
};
