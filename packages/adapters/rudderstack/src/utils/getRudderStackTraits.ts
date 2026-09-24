import type { TraitsUpdate } from "@priemskiyyy/trace";

export const getRudderStackTraits = ({ set, remove }: TraitsUpdate) => {
  const flat = Object.entries(set).flatMap(
    ([key, value]): [string, unknown][] => {
      // RudderStack merges an object or list into the value it holds, so keys the update dropped would stay.
      if (typeof value === "object") {
        return [];
      }

      return [[key, value]];
    },
  );

  return {
    traits: {
      ...Object.fromEntries(remove.map((key) => [key, null])),
      ...Object.fromEntries(flat),
    },
    isComplete: remove.length === 0 && flat.length === Object.keys(set).length,
  };
};
