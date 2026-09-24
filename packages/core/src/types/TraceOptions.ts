import type { DestinationName } from "src/types/DestinationName";
import type { Destinations } from "src/types/Destinations";
import type { TracePrivacy } from "src/types/TracePrivacy";
import type { TraceSchema } from "src/types/TraceSchema";
import type { TrackedEventOf } from "src/types/TrackedEventOf";

/**
 * Configuration of a `Trace`: the declared events, the destinations and how
 * events reach them. Constructing a Trace from it opens nothing.
 *
 * @example
 * ```ts
 * const trace = new Trace({
 *   events,
 *   destinations: { product: amplitude({ sdk: Amplitude, Identify: Amplitude.Identify }) },
 *   consent: { product: ["analytics"] },
 * });
 * ```
 */
export type TraceOptions<
  TEvents,
  TDestinations extends Destinations,
  TSchema extends TraceSchema,
  TPurpose extends string,
> = {
  events: TEvents;
  destinations: TDestinations;
  /** Validators for traits and group traits; with one, a key it does not declare is refused. */
  schema?: TSchema;
  /** Where an event goes and the context it carries unless it says otherwise. */
  defaults?: {
    to?:
      | DestinationName<TDestinations>[]
      | ((event: TrackedEventOf<TEvents>) => DestinationName<TDestinations>[]);
    context?: Record<string, unknown>;
  };
  // Extract rather than keyof & string, and | [], so the purposes infer from the lists and an empty list does not infer never.
  /** The purposes each destination needs; a destination it does not name is never gated. */
  consent?: Partial<
    Record<Extract<keyof TDestinations, string>, TPurpose[] | []>
  >;
  privacy?: TracePrivacy;
  /** Per destination, how many events wait for it to be ready (100) and for how many milliseconds (30000). */
  buffer?: { capacity?: number; maxAge?: number };
  /** Milliseconds one provider call may take before its outcome is `indeterminate`; 5000 by default. */
  timeout?: number;
  /** The clock in epoch milliseconds, for tests; `Date.now` by default. */
  now?: () => number;
};
