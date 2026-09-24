import type { AmplitudeEventOptions } from "src/types/AmplitudeEventOptions";

export const getAmplitudeIdentity = (
  user: { id: string } | null,
  anonymousId: string | undefined,
): AmplitudeEventOptions | null => {
  if (user === null) {
    return anonymousId === undefined ? null : { device_id: anonymousId };
  }

  return anonymousId === undefined
    ? { user_id: user.id }
    : { user_id: user.id, device_id: anonymousId };
};
