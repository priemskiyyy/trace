import type { MappingLoss } from "@priemskiyyy/trace";

export const getCutLosses = (
  value: unknown,
  path: string,
  maxLength: number,
): MappingLoss[] => {
  if (typeof value === "string") {
    if (value.length <= maxLength) {
      return [];
    }

    return [{ path, reason: "truncated" }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item: unknown, index) =>
      getCutLosses(item, `${path}.${index}`, maxLength),
    );
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]: [string, unknown]) =>
    getCutLosses(nested, `${path}.${key}`, maxLength),
  );
};
