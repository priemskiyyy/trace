import { TraceError } from "@priemskiyyy/trace";

import type { PostHogLike } from "src/types/PostHogLike";
import { assertPersonProfiles } from "src/utils/assertPersonProfiles";
import {
  COOKIELESS_DISTINCT_ID,
  MAX_DISTINCT_ID_LENGTH,
  REFUSED_DISTINCT_IDS,
} from "src/utils/constants/identity";

export const applyIdentify = (sdk: PostHogLike, user: { id: string }) => {
  assertPersonProfiles(sdk);

  if (
    user.id === COOKIELESS_DISTINCT_ID ||
    REFUSED_DISTINCT_IDS.includes(user.id.toLowerCase())
  ) {
    throw new TraceError({
      code: "UNSUPPORTED",
      message: `posthog-js refuses to identify "${user.id}", so the person stays anonymous there.`,
    });
  }

  const maxLength = Math.min(
    MAX_DISTINCT_ID_LENGTH,
    sdk.config.properties_string_max_length,
  );

  if (user.id.length > maxLength) {
    throw new TraceError({
      code: "DELIVERY_FAILED",
      message: `PostHog keeps the first ${maxLength} characters of a distinct id, so this user would share a person with any id that starts the same.`,
    });
  }

  sdk.identify(user.id);
};
