import { TraceError } from "@priemskiyyy/trace";

import type { PostHogLike } from "src/types/PostHogLike";
import { NO_PERSON_PROFILES } from "src/utils/constants/identity";

export const assertPersonProfiles = (sdk: PostHogLike) => {
  if (sdk.config.person_profiles === NO_PERSON_PROFILES) {
    throw new TraceError({
      code: "UNSUPPORTED",
      message: `PostHog's person_profiles "${NO_PERSON_PROFILES}" keeps no person, so it ignores identify, person properties and group properties.`,
    });
  }
};
