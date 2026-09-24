import type { TraitsUpdate } from "@priemskiyyy/trace";

import { LINE_PREFIX } from "src/utils/constants/lines";

export const formatTraitsLine = ({ user, set, remove }: TraitsUpdate) => {
  const segments = [
    `${LINE_PREFIX} traits`,
    user === null ? "anonymous" : JSON.stringify(user.id),
  ];

  const keys = Object.keys(set);

  if (keys.length > 0) {
    segments.push(`set ${JSON.stringify(keys)}`);
  }

  if (remove.length > 0) {
    segments.push(`remove ${JSON.stringify(remove)}`);
  }

  return segments.join(" ");
};
