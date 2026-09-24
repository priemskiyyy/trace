import {
  MAX_NAME_LENGTH,
  MAX_PROFILE_PROPERTY_SIZE,
} from "src/utils/constants/limits";
import { PROFILE_CONTROL_KEYS } from "src/utils/constants/properties";
import { getMixpanelValue } from "src/utils/getMixpanelValue";
import { getSentSize } from "src/utils/getSentSize";

export const getProfileUpdate = (update: Record<string, unknown>) => {
  const kept: [string, unknown][] = [];
  const remove: string[] = [];
  let isComplete = true;

  for (const [key, value] of Object.entries(update)) {
    if (key.length > MAX_NAME_LENGTH) {
      isComplete = false;

      continue;
    }

    if (value === null) {
      remove.push(key);

      continue;
    }

    const isRefused =
      PROFILE_CONTROL_KEYS.includes(key) ||
      getMixpanelValue(value, key, 1, false).losses.length > 0 ||
      (typeof value === "object" &&
        getSentSize(value) > MAX_PROFILE_PROPERTY_SIZE);

    if (isRefused) {
      isComplete = false;

      continue;
    }

    kept.push([key, value]);
  }

  return { set: Object.fromEntries(kept), remove, isComplete };
};
