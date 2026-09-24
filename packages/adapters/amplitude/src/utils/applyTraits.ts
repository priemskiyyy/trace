import type { TraitsUpdate } from "@priemskiyyy/trace";

import type { AmplitudeAdapterOptions } from "src/types/AmplitudeAdapterOptions";
import type { AmplitudeLike } from "src/types/AmplitudeLike";
import { applyPinnedCall } from "src/utils/applyPinnedCall";
import { createIdentify } from "src/utils/createIdentify";

export const applyTraits = (
  { sdk, Identify, plugin }: AmplitudeAdapterOptions<AmplitudeLike>,
  { user, set, remove }: TraitsUpdate,
) => {
  const { identify, refusal } = createIdentify(Identify, "traits", set, remove);

  applyPinnedCall({ sdk, plugin }, user, (pinned) =>
    sdk.identify(identify, pinned),
  );

  if (refusal !== null) {
    throw refusal;
  }
};
