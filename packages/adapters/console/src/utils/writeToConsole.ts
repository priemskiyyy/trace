import type { ConsoleWriter } from "src/types/ConsoleWriter";
import { assertUnreachable } from "src/utils/assertUnreachable";

export const writeToConsole: ConsoleWriter = (entry) => {
  if (entry.kind === "track") {
    globalThis.console.info(entry.line, entry.event);

    return;
  }

  if (
    entry.kind === "identify" ||
    entry.kind === "traits" ||
    entry.kind === "group"
  ) {
    globalThis.console.info(entry.line, entry.update);

    return;
  }

  if (entry.kind === "reset") {
    globalThis.console.info(entry.line);

    return;
  }

  assertUnreachable(entry);
};
