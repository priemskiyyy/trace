import { TraceError } from "@priemskiyyy/trace";
import type { GroupUpdate } from "@priemskiyyy/trace";

import type { PostHogLike } from "src/types/PostHogLike";
import { assertPersonProfiles } from "src/utils/assertPersonProfiles";
import { getKeptProperties } from "src/utils/getKeptProperties";

export const applyGroup = (
  sdk: PostHogLike,
  { group: { type, id, traits } }: GroupUpdate,
) => {
  assertPersonProfiles(sdk);

  if (id === null) {
    // posthog-js has no call that leaves one group type, and register replaces $groups whole.
    sdk.register({
      $groups: Object.fromEntries(
        Object.entries(sdk.getGroups()).flatMap(
          ([groupType, key]): [string, unknown][] => {
            if (groupType === type) {
              return [];
            }

            return [[groupType, key]];
          },
        ),
      ),
    });

    return;
  }

  const maxLength = sdk.config.properties_string_max_length;

  if (type.length > maxLength || id.length > maxLength) {
    throw new TraceError({
      code: "UNSUPPORTED",
      message:
        "posthog-js would cut this group's type or key past properties_string_max_length, so the membership was left out.",
    });
  }

  const { properties, refused } = getKeptProperties(
    traits,
    `group.${type}`,
    maxLength,
  );

  sdk.group(
    type,
    id,
    Object.keys(properties).length === 0 ? undefined : properties,
  );

  if (refused.length > 0) {
    throw new TraceError({
      code: "UNSUPPORTED",
      message: `posthog-js would cut these values past properties_string_max_length, so they were left out: ${refused.join(", ")}.`,
    });
  }
};
