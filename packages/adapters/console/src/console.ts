import type { AnalyticsAdapter } from "@priemskiyyy/trace";

import { formatGroupLine } from "src/formatting/formatGroupLine";
import { formatIdentifyLine } from "src/formatting/formatIdentifyLine";
import { formatTrackLine } from "src/formatting/formatTrackLine";
import { formatTraitsLine } from "src/formatting/formatTraitsLine";
import type { ConsoleAdapterOptions } from "src/types/ConsoleAdapterOptions";
import type { ConsoleWriter } from "src/types/ConsoleWriter";
import { LINE_PREFIX } from "src/utils/constants/lines";
import { writeToConsole } from "src/utils/writeToConsole";

/**
 * A development destination that prints each event and identity call, already
 * redacted, as every destination receives it. The core refuses a track made
 * from inside the write, so a console that tracks what it prints cannot start
 * a feedback loop.
 *
 * @example
 * ```ts
 * const trace = new Trace({ events, destinations: { console: console() } });
 * ```
 */
export const console = ({
  writer = writeToConsole,
}: ConsoleAdapterOptions = {}): AnalyticsAdapter<ConsoleWriter> => ({
  name: "console",
  open: () => ({
    native: writer,
    track: async (event) => {
      await writer({ kind: "track", line: formatTrackLine(event), event });

      return { status: "submitted", evidence: "sdk-call-returned" };
    },
    identify: async (update) => {
      await writer({
        kind: "identify",
        line: formatIdentifyLine(update),
        update,
      });
    },
    traits: async (update) => {
      await writer({ kind: "traits", line: formatTraitsLine(update), update });
    },
    group: async (update) => {
      await writer({ kind: "group", line: formatGroupLine(update), update });
    },
    reset: async () => {
      await writer({ kind: "reset", line: `${LINE_PREFIX} reset` });
    },
  }),
});
