import type { EventDefinition } from "src/types/EventDefinition";

export type EventInput<TDefinition> =
  TDefinition extends EventDefinition<infer TInput, unknown> ? TInput : never;
