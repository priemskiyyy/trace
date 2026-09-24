import { TraceError } from "@priemskiyyy/trace";
import type { EventDefinition } from "@priemskiyyy/trace";

import type { AmpliEventClass } from "src/types/AmpliEventClass";
import type { AmpliEvents } from "src/types/AmpliEvents";

/**
 * Declares the event registry from the classes Ampli generated, keyed by each
 * class's `event_type`, so the tracking plan's property types reach
 * `trace.track` unchanged and the constants a generated constructor injects
 * are sent.
 *
 * @example
 * ```ts
 * const events = fromAmpli({ "Checkout Started": CheckoutStarted });
 * ```
 */
// The overload preserves the name-to-class relation erased by the loop over the classes.
export function fromAmpli<TClasses extends Record<string, AmpliEventClass>>(
  classes: TClasses,
): AmpliEvents<TClasses>;

export function fromAmpli(
  classes: Record<string, AmpliEventClass>,
): Record<string, EventDefinition<never, object>> {
  const definitions: Record<string, EventDefinition<never, object>> = {};

  for (const [name, EventClass] of Object.entries(classes)) {
    // A generated class declares its name as a mutable field, which only an instance can answer.
    const eventType = new EventClass().event_type;

    if (eventType !== name) {
      throw new TraceError({
        code: "INVALID_CONFIGURATION",
        message: `fromAmpli was given the key ${JSON.stringify(name)} for a class whose event_type is ${JSON.stringify(eventType)}. Key each class by its event_type.`,
      });
    }

    definitions[name] = {
      parse: (input) => ({
        ok: true,
        properties: { ...new EventClass(input).event_properties },
      }),
    };
  }

  return Object.freeze(definitions);
}
