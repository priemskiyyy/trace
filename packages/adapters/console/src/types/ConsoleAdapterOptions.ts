import type { ConsoleWriter } from "src/types/ConsoleWriter";

/**
 * Options for `console()`.
 *
 * @example
 * ```ts
 * console({ writer: ({ line }) => process.stderr.write(`${line}\n`) });
 * ```
 */
export type ConsoleAdapterOptions = {
  /** Where entries go. Omitted, the global console is used, read when an entry is written. */
  writer?: ConsoleWriter;
};
