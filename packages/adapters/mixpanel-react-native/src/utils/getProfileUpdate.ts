import {
  MAX_NAME_LENGTH,
  MAX_PROFILE_PROPERTY_SIZE,
} from "src/utils/constants/limits";
import { BLANK_NAME } from "src/utils/constants/properties";
import { getMixpanelValue } from "src/utils/getMixpanelValue";
import { getSentSize } from "src/utils/getSentSize";

export const getProfileUpdate = ({
  set,
  remove,
}: {
  set: Record<string, unknown>;
  remove: string[];
}) => {
  const carried: Record<string, unknown> = {};
  const kept = remove.filter((name) => !BLANK_NAME.test(name));

  let isComplete = kept.length === remove.length;

  for (const [key, value] of Object.entries(set)) {
    const isExact =
      !BLANK_NAME.test(key) &&
      key.length <= MAX_NAME_LENGTH &&
      getMixpanelValue(value, key, 1, false).losses.length === 0 &&
      getSentSize(value) <= MAX_PROFILE_PROPERTY_SIZE;

    if (!isExact) {
      isComplete = false;

      continue;
    }

    carried[key] = value;
  }

  return { set: carried, remove: kept, isComplete };
};
