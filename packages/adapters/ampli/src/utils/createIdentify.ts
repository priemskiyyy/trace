import type { TraitsUpdate } from "@priemskiyyy/trace";

import type { AmplitudeIdentifyLike } from "src/types/AmplitudeIdentifyLike";
import {
  MAX_DEPTH,
  MAX_IDENTIFY_KEYS,
  MAX_VALUE_LENGTH,
} from "src/utils/constants/limits";

export const createIdentify = <TIdentify extends AmplitudeIdentifyLike>(
  Identify: new () => TIdentify,
  { set, remove }: TraitsUpdate,
) => {
  const identify = new Identify();
  const refused: string[] = [];

  // Identify drops a whole value for a null anywhere in it, a boolean or an array inside an array, or an object of over 1000 keys.
  const getValue = (
    value: unknown,
    path: string,
    layer: number,
    inArray: boolean,
  ): { kept: unknown[]; stripped: string[] } | null => {
    if (value === null) {
      return inArray ? null : { kept: [], stripped: [path] };
    }

    const isRefused =
      (typeof value === "string" && value.length > MAX_VALUE_LENGTH) ||
      (inArray && (typeof value === "boolean" || Array.isArray(value)));

    if (isRefused) {
      return null;
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

    const kept: [string, unknown][] = [];
    const stripped: string[] = [];

    for (const [key, nested] of Object.entries(value)) {
      const mapped = getValue(
        nested,
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

  for (const [key, value] of Object.entries(set)) {
    const mapped = getValue(value, `traits.${key}`, 2, false);

    if (mapped === null) {
      refused.push(`traits.${key}`);

      continue;
    }

    refused.push(...mapped.stripped);

    for (const kept of mapped.kept) {
      identify.set(key, kept);
    }
  }

  for (const key of remove) {
    identify.unset(key);
  }

  return { identify, refused };
};
