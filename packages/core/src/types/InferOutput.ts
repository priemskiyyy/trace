import type { StandardSchema } from "src/types/StandardSchema";

export type InferOutput<TSchema> =
  TSchema extends StandardSchema<unknown, infer TOutput> ? TOutput : never;
