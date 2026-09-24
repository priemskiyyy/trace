/**
 * A generated Ampli event class, as `fromAmpli` accepts it. Every generated
 * class fits, whatever its properties, and constructing one without arguments
 * is how its `event_type` is read.
 *
 * @example
 * ```ts
 * const declared: AmpliEventClass = Ampli.CheckoutStarted;
 * ```
 */
export type AmpliEventClass = new (...args: never[]) => {
  event_type: string;
  event_properties?: object | undefined;
};
