import {
  MAX_DEPTH,
  MAX_IDENTIFY_KEYS,
  MAX_PROPERTY_LENGTH,
} from "src/utils/constants/limits";

// Identify drops a whole value for a null anywhere in it, a boolean or a list inside a list, or an object of over 1,000 keys.
export const getIdentifyValue = (
  value: unknown,
  path: string,
  layer: number,
  isInList: boolean,
): { kept: unknown[]; stripped: string[] } | null => {
  const isRefused =
    (typeof value === "string" && value.length > MAX_PROPERTY_LENGTH) ||
    (isInList &&
      (value === null || typeof value === "boolean" || Array.isArray(value)));

  if (isRefused) {
    return null;
  }

  if (value === null) {
    return { kept: [], stripped: [path] };
  }

  if (typeof value !== "object") {
    return { kept: [value], stripped: [] };
  }

  const isTooLarge =
    layer > MAX_DEPTH ||
    (!Array.isArray(value) && Object.keys(value).length > MAX_IDENTIFY_KEYS);

  if (isTooLarge) {
    return null;
  }

  const children: [string, unknown][] = Object.entries(value);
  const kept: [string, unknown][] = [];
  const stripped: string[] = [];

  for (const [key, child] of children) {
    const mapped = getIdentifyValue(
      child,
      `${path}.${key}`,
      layer + 1,
      Array.isArray(value),
    );

    if (mapped === null) {
      return null;
    }

    kept.push(...mapped.kept.map((item): [string, unknown] => [key, item]));
    stripped.push(...mapped.stripped);
  }

  return {
    kept: [
      Array.isArray(value)
        ? kept.map(([, item]) => item)
        : Object.fromEntries(kept),
    ],
    stripped,
  };
};
