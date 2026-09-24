import type { AmplitudeEventOptions } from "src/types/AmplitudeEventOptions";
import type { AmplitudeLike } from "src/types/AmplitudeLike";

// Amplitude reads the user and device when its timeline processes a call, not when the call is made.
export const getPinnedOptions = (
  sdk: AmplitudeLike,
  user: { id: string } | null,
): Pick<AmplitudeEventOptions, "user_id" | "device_id"> => {
  const deviceId = sdk.getDeviceId();

  return {
    ...(user === null ? {} : { user_id: user.id }),
    ...(deviceId === undefined ? {} : { device_id: deviceId }),
  };
};
