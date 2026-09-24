import type { MappingLoss } from "@priemskiyyy/trace";

import type { Ga4Event } from "src/types/Ga4Event";
import {
  MAX_EVENT_PARAMETERS,
  MAX_VALUE_LENGTH,
  PAGE_VALUE_LENGTHS,
} from "src/utils/constants/limits";
import {
  CONTROL_PARAMETERS,
  FLAG_EVENT_PARAMETERS,
  NUMBER_EVENT_PARAMETERS,
  PARAMETER_NAME,
  WHOLE_NUMBER_EVENT_PARAMETERS,
} from "src/utils/constants/names";
import { getItems } from "src/utils/getItems";
import { isWholeNumber } from "src/utils/isWholeNumber";

export const getEventParameters = (
  { parameters, items }: Ga4Event,
  context: Record<string, unknown>,
) => {
  const sent: Record<string, unknown> = {};
  const losses: MappingLoss[] = [];

  if (items !== undefined) {
    const built = getItems(items);

    sent["items"] = built.items;
    losses.push(...built.losses);
  }

  const entries = [
    ...Object.entries(parameters).map(([name, value]) => ({
      name,
      value,
      path: `parameters.${name}`,
      isShadowed: false,
    })),
    ...Object.entries(context).map(([name, value]) => ({
      name,
      value,
      path: `context.${name}`,
      isShadowed: Object.hasOwn(parameters, name),
    })),
  ];

  for (const { name, value, path, isShadowed } of entries) {
    if (isShadowed || CONTROL_PARAMETERS.includes(name)) {
      losses.push({ path, reason: "omitted" });

      continue;
    }

    if (!PARAMETER_NAME.test(name)) {
      losses.push({ path, reason: "invalid" });

      continue;
    }

    if (Object.keys(sent).length >= MAX_EVENT_PARAMETERS) {
      losses.push({ path, reason: "truncated" });

      continue;
    }

    if (typeof value === "object" && value !== null) {
      losses.push({ path, reason: "unsupported" });

      continue;
    }

    if (
      NUMBER_EVENT_PARAMETERS.includes(name) &&
      (typeof value === "string" || value === null)
    ) {
      losses.push({ path, reason: "invalid" });

      continue;
    }

    const isCoerced =
      (WHOLE_NUMBER_EVENT_PARAMETERS.includes(name) && !isWholeNumber(value)) ||
      (FLAG_EVENT_PARAMETERS.includes(name) && value !== 0 && value !== 1);

    if (isCoerced) {
      losses.push({ path, reason: "coerced" });
      sent[name] = value;

      continue;
    }

    const limit =
      Object.entries(PAGE_VALUE_LENGTHS).find(([page]) => page === name)?.[1] ??
      MAX_VALUE_LENGTH;

    const characters = typeof value === "string" ? [...value] : [];

    if (characters.length > limit) {
      losses.push({ path, reason: "truncated" });
      sent[name] = characters.slice(0, limit).join("");

      continue;
    }

    sent[name] = value;
  }

  return { parameters: sent, losses };
};
