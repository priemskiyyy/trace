import type { TraceSchema } from "src/types/TraceSchema";
import type { TraitsOf } from "src/types/TraitsOf";

export type TraitsInput<TSchema extends TraceSchema> = {
  [TKey in keyof TraitsOf<TSchema>]?: TraitsOf<TSchema>[TKey] | null;
};
