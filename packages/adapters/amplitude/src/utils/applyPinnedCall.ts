import { TraceError } from "@priemskiyyy/trace";

import type { AmplitudeAdapterOptions } from "src/types/AmplitudeAdapterOptions";
import type { AmplitudeEventOptions } from "src/types/AmplitudeEventOptions";
import type { AmplitudeLike } from "src/types/AmplitudeLike";
import { getPinnedOptions } from "src/utils/getPinnedOptions";

export const applyPinnedCall = <TAnswer>(
  {
    sdk,
    plugin,
  }: Pick<AmplitudeAdapterOptions<AmplitudeLike>, "sdk" | "plugin">,
  user: { id: string } | null,
  call: (options: AmplitudeEventOptions) => TAnswer,
) => {
  if (!plugin.isSetUp()) {
    throw new TraceError({
      code: "NOT_INITIALIZED",
      message:
        "Trace's identity plugin is no longer installed in Amplitude, so the call was not sent. A later init() or remove() takes it out: add it again with add().",
    });
  }

  const pinned = getPinnedOptions(sdk, user);

  // Amplitude keeps the user and device a call names itself, but only the plugin can take a user off an anonymous one.
  return call({ ...pinned, extra: { "@priemskiyyy/trace-amplitude": pinned } });
};
