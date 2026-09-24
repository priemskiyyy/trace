import { TraceError } from "@priemskiyyy/trace";

import type { MixpanelLike } from "src/types/MixpanelLike";
import { MAX_STRING_LENGTH } from "src/utils/constants/limits";

export const applyIdentify = (sdk: MixpanelLike, id: string) => {
  if (id.length > MAX_STRING_LENGTH) {
    throw new TraceError({
      code: "DELIVERY_FAILED",
      message: `mixpanel-browser keeps the first ${MAX_STRING_LENGTH} characters of a distinct id, so this user would share an identity with any id that starts the same.`,
    });
  }

  if (sdk.identify(id) === -1) {
    throw new TraceError({
      code: "UNSUPPORTED",
      message:
        "Mixpanel refused to identify the user: an id may not start with $device:, and a before_identify hook refuses one by answering undefined.",
    });
  }
};
