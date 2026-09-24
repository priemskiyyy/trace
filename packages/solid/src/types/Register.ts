import type {
  DestinationName,
  Destinations,
  EventDefinition,
  Trace,
  TraceSchema,
} from "@priemskiyyy/trace";

/**
 * Declaration-merging target that types every export of this package with the
 * application's Trace. Augment it once, next to the Trace:
 *
 * @example
 * ```ts
 * declare module "@priemskiyyy/trace-solid" {
 *   interface Register {
 *     trace: typeof trace;
 *   }
 * }
 * ```
 */
export interface Register {}

type Registration = Register extends {
  trace: Trace<
    infer TEvents extends Record<string, EventDefinition<never, unknown>>,
    infer TDestinations extends Destinations,
    infer TSchema extends TraceSchema,
    infer TPurpose extends string
  >;
}
  ? {
      events: TEvents;
      destinations: TDestinations;
      schema: TSchema;
      purpose: TPurpose;
    }
  : {
      events: Record<string, EventDefinition<never, unknown>>;
      destinations: Destinations;
      schema: TraceSchema;
      purpose: string;
    };

/**
 * The registered Trace's event registry, or any event name with no properties
 * when nothing is registered.
 *
 * @example
 * ```ts
 * type CheckoutStarted = RegisteredEvents["Checkout Started"];
 * ```
 */
export type RegisteredEvents = Registration["events"];

/**
 * The registered Trace's purposes, or any string when nothing is registered.
 *
 * @example
 * ```ts
 * const purpose: RegisteredPurpose = "analytics";
 * ```
 */
export type RegisteredPurpose = Registration["purpose"];

/**
 * The names the registered Trace's destinations were given, or any string when
 * nothing is registered.
 *
 * @example
 * ```ts
 * const name: RegisteredDestinationName = "product";
 * ```
 */
export type RegisteredDestinationName = DestinationName<
  Registration["destinations"]
>;

/**
 * The registered Trace. Unregistered, it is the untyped Trace, which a Trace
 * that declares its own events cannot be assigned to.
 *
 * @example
 * ```ts
 * const trace: RegisteredTrace = useTrace()();
 * ```
 */
export type RegisteredTrace = Trace<
  RegisteredEvents,
  Registration["destinations"],
  Registration["schema"],
  RegisteredPurpose
>;
