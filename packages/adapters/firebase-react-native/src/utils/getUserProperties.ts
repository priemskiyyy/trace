import type { TraitsUpdate } from "@priemskiyyy/trace";

import { MAX_USER_PROPERTY_VALUE_LENGTH } from "src/utils/constants/limits";
import {
  RESERVED_USER_PROPERTY_NAMES,
  USER_PROPERTY_NAME,
} from "src/utils/constants/names";

const isUserPropertyName = (name: string) =>
  USER_PROPERTY_NAME.test(name) && !RESERVED_USER_PROPERTY_NAMES.includes(name);

export const getUserProperties = ({ set, remove }: TraitsUpdate) => {
  const properties: Record<string, string | null> = {};

  let complete = true;

  for (const name of remove) {
    if (isUserPropertyName(name)) {
      properties[name] = null;
    }
  }

  for (const [name, value] of Object.entries(set)) {
    const text =
      typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : value;

    if (
      !isUserPropertyName(name) ||
      typeof text !== "string" ||
      [...text].length > MAX_USER_PROPERTY_VALUE_LENGTH
    ) {
      complete = false;

      continue;
    }

    properties[name] = text;
  }

  return { properties, complete };
};
