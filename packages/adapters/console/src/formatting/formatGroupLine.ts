import type { GroupUpdate } from "@priemskiyyy/trace";

import { LINE_PREFIX } from "src/utils/constants/lines";

export const formatGroupLine = ({ group }: GroupUpdate) => {
  const line = `${LINE_PREFIX} group ${JSON.stringify(group.type)}`;

  if (group.id === null) {
    return `${line} left`;
  }

  const keys = Object.keys(group.traits);

  if (keys.length === 0) {
    return `${line} ${JSON.stringify(group.id)}`;
  }

  return `${line} ${JSON.stringify(group.id)} ${JSON.stringify(keys)}`;
};
