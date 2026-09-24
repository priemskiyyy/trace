import type { ConsoleEntry } from "src/types/ConsoleEntry";

/**
 * Receives each entry, and a returned promise is awaited before the call's
 * outcome settles. Other return values are ignored, so existing logger methods
 * can be passed directly.
 *
 * @example
 * ```ts
 * const writer: ConsoleWriter = ({ line }) => logger.debug(line);
 * ```
 */
export type ConsoleWriter = (
  entry: ConsoleEntry,
) => void | PromiseLike<unknown>;
