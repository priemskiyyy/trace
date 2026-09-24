import type { InferOutput } from "src/types/InferOutput";
import type { StandardSchema } from "src/types/StandardSchema";

export type InferInput<TSchema> = TSchema extends StandardSchema
  ? "types" extends keyof TSchema["~standard"]
    ? NonNullable<TSchema["~standard"]["types"]>["input"]
    : InferOutput<TSchema>
  : never;
