export const getKeptProperties = (
  properties: Record<string, unknown>,
  root: string,
  maxLength: number,
) => {
  const isCut = (value: unknown): boolean => {
    if (typeof value === "string") {
      return value.length > maxLength;
    }

    if (typeof value !== "object" || value === null) {
      return false;
    }

    return Object.values(value).some(isCut);
  };

  const refused: string[] = [];

  const kept = Object.entries(properties).flatMap(
    ([key, value]): [string, unknown][] => {
      if (isCut(value)) {
        refused.push(`${root}.${key}`);

        return [];
      }

      return [[key, value]];
    },
  );

  return { properties: Object.fromEntries(kept), refused };
};
