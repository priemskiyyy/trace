import type { IdentifyUpdate } from "@priemskiyyy/trace";

import { LINE_PREFIX } from "src/utils/constants/lines";

export const formatIdentifyLine = ({ user }: IdentifyUpdate) =>
  `${LINE_PREFIX} identify ${JSON.stringify(user.id)}`;
