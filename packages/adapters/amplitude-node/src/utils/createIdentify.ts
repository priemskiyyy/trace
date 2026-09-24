import { TraceError } from "@priemskiyyy/trace";

import type { AmplitudeIdentifyLike } from "src/types/AmplitudeIdentifyLike";
import { getIdentifyValue } from "src/utils/getIdentifyValue";

export const createIdentify = <TIdentify extends AmplitudeIdentifyLike>(
  Identify: new () => TIdentify,
  path: string,
  set: Record<string, unknown>,
  remove: string[],
) => {
  const identify = new Identify();
  const refused: string[] = [];

  for (const key of remove) {
    identify.unset(key);
  }

  for (const [key, value] of Object.entries(set)) {
    if (value === null) {
      identify.unset(key);
      continue;
    }

    const mapped = getIdentifyValue(value, `${path}.${key}`, 2, false);

    if (mapped === null) {
      refused.push(`${path}.${key}`);
      continue;
    }

    refused.push(...mapped.stripped);

    for (const kept of mapped.kept) {
      identify.set(key, kept);
    }
  }

  if (refused.length === 0) {
    return { identify, refusal: null };
  }

  return {
    identify,
    refusal: new TraceError({
      code: "UNSUPPORTED",
      message: `Amplitude cannot take these values, so they were left out: ${refused.join(", ")}.`,
    }),
  };
};
