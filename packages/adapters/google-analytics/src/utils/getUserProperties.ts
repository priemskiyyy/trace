import type { TraitsUpdate } from "@priemskiyyy/trace";

import { MAX_USER_PROPERTY_VALUE_LENGTH } from "src/utils/constants/limits";
import {
  RESERVED_USER_PROPERTY_NAMES,
  USER_PROPERTY_NAME,
} from "src/utils/constants/names";

const isUserPropertyName = (name: string) =>
  USER_PROPERTY_NAME.test(name) && !RESERVED_USER_PROPERTY_NAMES.includes(name);

export const getUserProperties = ({ set, remove }: TraitsUpdate) => {
  const properties: Record<string, unknown> = {};

  let complete = true;

  for (const name of remove) {
    if (isUserPropertyName(name)) {
      properties[name] = null;
    }
  }

  for (const [name, value] of Object.entries(set)) {
    const isNested = typeof value === "object" && value !== null;

    const isLong =
      typeof value === "string" &&
      [...value].length > MAX_USER_PROPERTY_VALUE_LENGTH;

    if (!isUserPropertyName(name) || isNested || isLong) {
      complete = false;

      continue;
    }

    properties[name] = value;
  }

  return { properties, complete };
};
