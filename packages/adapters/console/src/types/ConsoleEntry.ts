import type {
  GroupUpdate,
  IdentifyUpdate,
  TrackedEvent,
  TraitsUpdate,
} from "@priemskiyyy/trace";

/**
 * One call the destination was given: its `kind`, a one line summary prefixed
 * `[trace]`, and the frozen, already sanitized value it describes, which is
 * the event for `track` and the update for `identify`, `traits` and `group`.
 *
 * @example
 * ```ts
 * const print = (entry: ConsoleEntry) => {
 *   if (entry.kind === "track") {
 *     logger.debug(entry.line, entry.event.properties);
 *   }
 * };
 * ```
 */
export type ConsoleEntry =
  | { kind: "track"; line: string; event: TrackedEvent }
  | { kind: "identify"; line: string; update: IdentifyUpdate }
  | { kind: "traits"; line: string; update: TraitsUpdate }
  | { kind: "group"; line: string; update: GroupUpdate }
  | { kind: "reset"; line: string };
