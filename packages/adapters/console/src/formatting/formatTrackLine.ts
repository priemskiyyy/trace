import type { TrackedEvent } from "@priemskiyyy/trace";

import { LINE_PREFIX } from "src/utils/constants/lines";

export const formatTrackLine = ({ name, properties }: TrackedEvent) => {
  const line = `${LINE_PREFIX} track ${JSON.stringify(name)}`;
  const keys = Object.keys(properties);

  if (keys.length === 0) {
    return line;
  }

  return `${line} ${JSON.stringify(keys)}`;
};
