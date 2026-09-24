import type { GroupUpdate } from "@priemskiyyy/trace";

import type { AmplitudeAdapterOptions } from "src/types/AmplitudeAdapterOptions";
import type { AmplitudeLike } from "src/types/AmplitudeLike";
import { applyPinnedCall } from "src/utils/applyPinnedCall";
import { createIdentify } from "src/utils/createIdentify";

export const applyGroup = (
  { sdk, Identify, plugin }: AmplitudeAdapterOptions<AmplitudeLike>,
  { user, group: { type, id, traits } }: GroupUpdate,
) => {
  // Amplitude documents no way to leave a group, so an empty list overwrites the membership.
  applyPinnedCall({ sdk, plugin }, user, (pinned) =>
    sdk.setGroup(type, id ?? [], pinned),
  );

  if (id === null || Object.keys(traits).length === 0) {
    return;
  }

  const { identify, refusal } = createIdentify(
    Identify,
    `group.${type}`,
    traits,
    [],
  );

  applyPinnedCall({ sdk, plugin }, user, (pinned) =>
    sdk.groupIdentify(type, id, identify, pinned),
  );

  if (refusal !== null) {
    throw refusal;
  }
};
