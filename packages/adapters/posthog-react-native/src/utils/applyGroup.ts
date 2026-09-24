import type { GroupUpdate } from "@priemskiyyy/trace";

import type { PostHogLike } from "src/types/PostHogLike";
import { SUPER_PROPERTIES_KEY } from "src/utils/constants/properties";

export const applyGroup = async (
  sdk: PostHogLike,
  { group: { type, id, traits } }: GroupUpdate,
) => {
  if (id !== null) {
    sdk.group(type, id, Object.keys(traits).length === 0 ? undefined : traits);

    return;
  }

  // posthog-react-native has no call that leaves one group type, and register replaces $groups whole.
  const held = sdk.getPersistedProperty(SUPER_PROPERTIES_KEY)?.$groups ?? {};

  await sdk.register({
    $groups: Object.fromEntries(
      Object.entries(held).flatMap(
        ([groupType, key]): [string, string | number][] => {
          if (groupType === type) {
            return [];
          }

          return [[groupType, key]];
        },
      ),
    ),
  });
};
