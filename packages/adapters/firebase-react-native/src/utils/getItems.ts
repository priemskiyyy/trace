import type { MappingLoss } from "@priemskiyyy/trace";

import type { Ga4Item } from "src/types/Ga4Item";
import {
  MAX_CUSTOM_ITEM_PARAMETERS,
  MAX_ITEMS,
} from "src/utils/constants/limits";
import {
  ITEM_PARAMETERS,
  WHOLE_NUMBER_PARAMETERS,
} from "src/utils/constants/names";
import { isWholeNumber } from "src/utils/isWholeNumber";

export const getItems = (items: Ga4Item[]) => {
  const truncated: MappingLoss[] =
    items.length > MAX_ITEMS ? [{ path: "items", reason: "truncated" }] : [];

  const built = items.slice(0, MAX_ITEMS).map((item, index) => {
    const fields: Record<string, unknown> = {};
    const losses: MappingLoss[] = [];

    let custom = 0;

    for (const [name, value] of Object.entries(item)) {
      if (typeof value === "object" && value !== null) {
        losses.push({ path: `items.${index}.${name}`, reason: "unsupported" });

        continue;
      }

      if (!Object.hasOwn(ITEM_PARAMETERS, name)) {
        custom += 1;

        if (custom === MAX_CUSTOM_ITEM_PARAMETERS + 1) {
          losses.push({ path: `items.${index}`, reason: "truncated" });
        }

        if (custom > MAX_CUSTOM_ITEM_PARAMETERS) {
          continue;
        }
      }

      if (WHOLE_NUMBER_PARAMETERS.includes(name) && !isWholeNumber(value)) {
        losses.push({ path: `items.${index}.${name}`, reason: "coerced" });
      }

      fields[name] = value;
    }

    return { fields, losses };
  });

  return {
    items: built.map(({ fields }) => fields),
    losses: [...truncated, ...built.flatMap(({ losses }) => losses)],
  };
};
