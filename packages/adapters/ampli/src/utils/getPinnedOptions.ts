import { TraceError } from "@priemskiyyy/trace";

import type { AmpliEventOptions } from "src/types/AmpliEventOptions";
import type { AmpliLike } from "src/types/AmpliLike";
import type { IdentityPlugin } from "src/types/IdentityPlugin";

// Amplitude fills a call's user and device when its timeline processes it, a macrotask later, and keeps the ones a call brings; only the plugin can take out the user it fills into an anonymous call.
export const getPinnedOptions = (
  plugin: Pick<IdentityPlugin, "isSetUp">,
  client: Pick<AmpliLike["client"], "getDeviceId">,
  user: { id: string } | null,
): Pick<AmpliEventOptions, "user_id" | "device_id" | "extra"> => {
  if (!plugin.isSetUp()) {
    throw new TraceError({
      code: "NOT_INITIALIZED",
      message:
        "Trace's identity plugin is no longer installed on ampli.client, so the call was not sent. A later init() or remove() takes it out: add it again with ampli.client.add().",
    });
  }

  const deviceId = client.getDeviceId();

  const pinned = {
    ...(user === null ? {} : { user_id: user.id }),
    ...(deviceId === undefined ? {} : { device_id: deviceId }),
  };

  return { ...pinned, extra: { "@priemskiyyy/trace-ampli": pinned } };
};
