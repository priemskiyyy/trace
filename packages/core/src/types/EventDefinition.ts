import type { ParseResult } from "src/types/ParseResult";

/**
 * One declared event: `parse` checks its properties each time it is tracked.
 * `event()` builds one, from a type argument or a Standard Schema.
 *
 * @example
 * ```ts
 * const searchPerformed: EventDefinition<{ query: string }> = event<{ query: string }>();
 * ```
 */
export type EventDefinition<TInput, TOutput = TInput> = {
  // A method, so that a registry of differently typed events stays assignable.
  parse(input: TInput): ParseResult<TOutput>;
};
