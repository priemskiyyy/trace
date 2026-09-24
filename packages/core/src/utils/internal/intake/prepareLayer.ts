import type { Layer } from "src/types/internal/Layer";
import type { PrivacyPolicy } from "src/types/internal/PrivacyPolicy";
import type { StandardSchema } from "src/types/StandardSchema";
import { getOwnValue } from "src/utils/common/getOwnValue";
import { isPlainObject } from "src/utils/common/isPlainObject";
import { getCappedLosses } from "src/utils/internal/intake/getCappedLosses";
import { getLossesByKey } from "src/utils/internal/intake/getLossesByKey";
import { sanitizeValue } from "src/utils/internal/privacy/sanitizeValue";
import { validateWithSchema } from "src/utils/internal/schema/validateWithSchema";

export const prepareLayer = (
  input: unknown,
  {
    root,
    policy,
    schema = null,
  }: {
    root: string;
    policy: PrivacyPolicy;
    schema?: Map<string, StandardSchema<unknown, unknown>> | null;
  },
) => {
  const layer: Layer = new Map();
  const refused: string[] = [];

  if (input === undefined || input === null) {
    return { layer, refused };
  }

  if (!isPlainObject(input)) {
    return { layer, refused: [root] };
  }

  const accepted: [string, unknown][] = [];

  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(input),
  )) {
    const value: unknown = descriptor.value;

    if (!descriptor.enumerable || value === undefined) {
      continue;
    }

    const validator = schema === null ? null : schema.get(key);

    if (validator === undefined) {
      refused.push(`${root}.${key}`);

      continue;
    }

    if (value === null || validator === null) {
      accepted.push([key, value]);

      continue;
    }

    const result = validateWithSchema(validator, value);

    if (!result.ok) {
      refused.push(`${root}.${key}`);

      continue;
    }

    accepted.push([key, result.properties]);
  }

  const given = accepted.flatMap(([key, value]): [string, unknown][] => {
    if (value === null) {
      return [];
    }

    return [[key, value]];
  });

  const sanitized = sanitizeValue(Object.fromEntries(given), policy, root);

  const { byKey, rest } = getLossesByKey(
    given.map(([key]) => key),
    root,
    sanitized.losses,
  );

  for (const [key, value] of accepted) {
    if (value === null) {
      const withheld = policy.redact(key, `${root}.${key}`);

      layer.set(
        key,
        Object.freeze({ value: withheld ? undefined : null, losses: [] }),
      );

      continue;
    }

    layer.set(
      key,
      Object.freeze({
        value: getOwnValue(sanitized.value, key),
        losses: getCappedLosses(
          [...(byKey.get(key) ?? []), ...rest],
          root,
          policy.limits.breadth,
        ),
      }),
    );
  }

  return { layer, refused };
};
