import type { SegmentIdentity } from "src/types/SegmentIdentity";

export const getSegmentIdentity = (
  user: { id: string } | null,
  anonymousId: string | undefined,
): SegmentIdentity | null => {
  if (user === null) {
    return anonymousId === undefined ? null : { anonymousId };
  }

  return anonymousId === undefined
    ? { userId: user.id }
    : { userId: user.id, anonymousId };
};
