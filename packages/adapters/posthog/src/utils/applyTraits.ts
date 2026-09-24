import { TraceError } from "@priemskiyyy/trace";
import type { TraitsUpdate } from "@priemskiyyy/trace";

import type { PostHogLike } from "src/types/PostHogLike";
import { assertPersonProfiles } from "src/utils/assertPersonProfiles";
import { getKeptProperties } from "src/utils/getKeptProperties";

export const applyTraits = (
  sdk: PostHogLike,
  { set, remove }: TraitsUpdate,
) => {
  assertPersonProfiles(sdk);

  const { properties, refused } = getKeptProperties(
    set,
    "traits",
    sdk.config.properties_string_max_length,
  );

  if (remove.length > 0) {
    sdk.unsetPersonProperties(remove);
  }

  if (Object.keys(properties).length > 0) {
    sdk.setPersonProperties(properties);
  }

  if (refused.length > 0) {
    throw new TraceError({
      code: "UNSUPPORTED",
      message: `posthog-js would cut these values past properties_string_max_length, so they were left out: ${refused.join(", ")}.`,
    });
  }
};
