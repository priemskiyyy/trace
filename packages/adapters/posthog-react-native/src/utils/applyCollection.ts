import type { PostHogLike } from "src/types/PostHogLike";

export const applyCollection = (sdk: PostHogLike, enabled: boolean) =>
  enabled ? sdk.optIn() : sdk.optOut();
