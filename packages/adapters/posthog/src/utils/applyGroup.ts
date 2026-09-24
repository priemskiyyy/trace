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

  // posthog-js has no call that leaves one group type, and register replaces $groups whole.
  const leave = () => {
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
  };

  if (id === null) {
    leave();

    return;
  }

  const maxLength = sdk.config.properties_string_max_length;

  if (type.length > maxLength) {
    throw new TraceError({
      code: "UNSUPPORTED",
      message:
        "posthog-js would cut this group type past properties_string_max_length, so the membership was left out.",
    });
  }

  if (id.length > maxLength) {
    leave();

    throw new TraceError({
      code: "UNSUPPORTED",
      message:
        "posthog-js would cut this group key past properties_string_max_length, so the membership was left out and the user left any group of this type.",
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
