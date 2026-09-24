import type { EventDefinition } from "@priemskiyyy/trace";

import type { AmpliEventClass } from "src/types/AmpliEventClass";

/**
 * The event registry `fromAmpli` builds: each canonical name takes what its
 * generated constructor takes and sends what the constructed class holds, so
 * `trace.track` is typed by the tracking plan itself.
 *
 * @example
 * ```ts
 * const events: AmpliEvents<{ "Checkout Started": typeof Ampli.CheckoutStarted }> =
 *   fromAmpli({ "Checkout Started": Ampli.CheckoutStarted });
 * ```
 */
export type AmpliEvents<TClasses extends Record<string, AmpliEventClass>> = {
  [TName in keyof TClasses]: EventDefinition<
    ConstructorParameters<TClasses[TName]> extends []
      ? undefined
      : ConstructorParameters<TClasses[TName]>[0],
    "event_properties" extends keyof InstanceType<TClasses[TName]>
      ? NonNullable<InstanceType<TClasses[TName]>["event_properties"]>
      : Record<string, never>
  >;
};
