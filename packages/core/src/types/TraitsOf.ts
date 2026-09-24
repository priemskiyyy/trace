import type { InferOutput } from "src/types/InferOutput";
import type { StandardSchema } from "src/types/StandardSchema";
import type { TraceSchema } from "src/types/TraceSchema";

/**
 * The user traits a schema declares, or any record when it declares none.
 *
 * @example
 * ```ts
 * const traits: TraitsOf<typeof schema> = { plan: "pro" };
 * ```
 */
export type TraitsOf<TSchema extends TraceSchema> = TSchema extends {
  traits: infer TTraits extends Record<
    string,
    StandardSchema<unknown, unknown>
  >;
}
  ? { [TKey in keyof TTraits]: InferOutput<TTraits[TKey]> }
  : Record<string, unknown>;
