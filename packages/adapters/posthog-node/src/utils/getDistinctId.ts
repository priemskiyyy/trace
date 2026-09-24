import { MAX_DISTINCT_ID_LENGTH } from "src/utils/constants/identity";

export const getDistinctId = (
  user: { id: string } | null,
  anonymousId: string | undefined,
) => {
  if (user !== null) {
    return user.id;
  }

  // posthog-node takes an empty id for none, PostHog discards a blank one and shortens a long one.
  if (
    anonymousId === undefined ||
    anonymousId.trim() === "" ||
    anonymousId.length > MAX_DISTINCT_ID_LENGTH
  ) {
    return null;
  }

  return anonymousId;
};
