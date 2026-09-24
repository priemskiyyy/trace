import type { PostHogLike } from "src/types/PostHogLike";
import { OPT_IN_OPTIONS } from "src/utils/constants/configuration";

export const applyCollection = (sdk: PostHogLike, enabled: boolean) => {
  if (enabled) {
    sdk.opt_in_capturing(OPT_IN_OPTIONS);

    return;
  }

  sdk.opt_out_capturing();
};
