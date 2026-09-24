import { TraceError } from "@priemskiyyy/trace";

import type { PostHogLike } from "src/types/PostHogLike";
import {
  MAX_DISTINCT_ID_LENGTH,
  REFUSED_DISTINCT_IDS,
  REFUSED_EXACT_DISTINCT_IDS,
} from "src/utils/constants/identity";

export const applyIdentify = (sdk: PostHogLike, user: { id: string }) => {
  if (
    REFUSED_DISTINCT_IDS.includes(user.id.toLowerCase()) ||
    REFUSED_EXACT_DISTINCT_IDS.includes(user.id) ||
    user.id.trim() === ""
  ) {
    throw new TraceError({
      code: "UNSUPPORTED",
      message:
        "PostHog refuses to identify a person by a placeholder id like this one, so the person stays anonymous there.",
    });
  }

  if (user.id.length > MAX_DISTINCT_ID_LENGTH) {
    throw new TraceError({
      code: "DELIVERY_FAILED",
      message: `PostHog keeps the first ${MAX_DISTINCT_ID_LENGTH} characters of a distinct id, so this user would share a person with any id that starts the same.`,
    });
  }

  sdk.identify(user.id);
};
