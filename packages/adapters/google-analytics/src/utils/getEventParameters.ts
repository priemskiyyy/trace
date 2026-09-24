import type { MappingLoss } from "@priemskiyyy/trace";

import type { Ga4Event } from "src/types/Ga4Event";
import {
  MAX_EVENT_PARAMETERS,
  MAX_VALUE_LENGTH,
  PAGE_VALUE_LENGTHS,
} from "src/utils/constants/limits";
import {
  CONTROL_PARAMETERS,
  ECOMMERCE_EVENT_NAMES,
  PARAMETER_NAME,
} from "src/utils/constants/names";
import { getItems } from "src/utils/getItems";

export const getEventParameters = (
  { name: eventName, parameters, items }: Ga4Event,
  context: Record<string, unknown>,
) => {
  const sent: Record<string, unknown> = {};
  const losses: MappingLoss[] = [];

  if (items !== undefined && !ECOMMERCE_EVENT_NAMES.includes(eventName)) {
    losses.push({ path: "items", reason: "unsupported" });
  }

  if (items !== undefined && ECOMMERCE_EVENT_NAMES.includes(eventName)) {
    const built = getItems(items);

    sent["items"] = built.items;
    losses.push(...built.losses);
  }

  const entries = [
    ...Object.entries(parameters).map(([name, value]) => ({
      name,
      value,
      path: `parameters.${name}`,
    })),
    ...Object.entries(context).map(([name, value]) => ({
      name,
      value,
      path: `context.${name}`,
    })),
  ];

  for (const { name, value, path } of entries) {
    if (Object.hasOwn(sent, name) || CONTROL_PARAMETERS.includes(name)) {
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
