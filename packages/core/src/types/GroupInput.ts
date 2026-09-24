import type { GroupsOf } from "src/types/GroupsOf";
import type { TraceSchema } from "src/types/TraceSchema";

export type GroupInput<
  TSchema extends TraceSchema,
  TType extends keyof GroupsOf<TSchema>,
> = {
  id: string;
  traits?: {
    [TKey in keyof GroupsOf<TSchema>[TType]]?:
      GroupsOf<TSchema>[TType][TKey] | null;
  };
};
