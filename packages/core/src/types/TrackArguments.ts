import type { EventInput } from "src/types/EventInput";
import type { TrackOptions } from "src/types/TrackOptions";

export type TrackArguments<TDefinition, TName extends string> = [
  EventInput<TDefinition>,
] extends [undefined]
  ? [properties?: undefined, options?: TrackOptions<TName>]
  : undefined extends EventInput<TDefinition>
    ? [properties?: EventInput<TDefinition>, options?: TrackOptions<TName>]
    : [properties: EventInput<TDefinition>, options?: TrackOptions<TName>];
