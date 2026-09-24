import type { InferOutput } from "src/types/InferOutput";
import type { StandardSchema } from "src/types/StandardSchema";
import type { TraceSchema } from "src/types/TraceSchema";

/**
 * The group traits a schema declares for each group type, or any record when
 * it declares none.
 *
 * @example
 * ```ts
 * const workspace: GroupsOf<typeof schema>["workspace"] = { plan: "team" };
 * ```
 */
export type GroupsOf<TSchema extends TraceSchema> = TSchema extends {
  groups: infer TGroups extends Record<
    string,
    Record<string, StandardSchema<unknown, unknown>>
  >;
}
  ? {
      [TType in keyof TGroups]: {
        [TKey in keyof TGroups[TType]]: InferOutput<TGroups[TType][TKey]>;
      };
    }
  : Record<string, Record<string, unknown>>;
