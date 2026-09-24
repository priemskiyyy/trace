/**
 * Bounds applied to properties, context, traits and group traits before
 * anything is kept or sent. What they cut is a `truncated` loss.
 *
 * @example
 * ```ts
 * new Trace({ events, destinations, privacy: { limits: { depth: 4, stringLength: 500 } } });
 * ```
 */
export type TraceLimits = {
  /** How many levels of objects and lists are kept, the outermost one included. */
  depth: number;
  /** How many keys an object keeps and how many items a list keeps. */
  breadth: number;
  /** How many characters a string keeps. */
  stringLength: number;
  /** How many characters the whole value may take once serialized. */
  totalSize: number;
};
