import { TraceError } from "@priemskiyyy/trace";
import { inject } from "vue";
import type { ComputedRef } from "vue";

import { TRACE_CONTEXT } from "src/context/TraceContext";
import type { RegisteredTrace } from "src/types/Register";

/**
 * Returns the nearest provider's Trace as a computed ref, starting and
 * tracking nothing, and throws when there is no provider. Augment `Register`
 * to type it.
 *
 * @example
 * ```ts
 * const trace = useTrace();
 *
 * const handleCheckoutClick = () => trace.value.track("Checkout Started", { cart: { id: cart.id } });
 * ```
 */
export const useTrace = (): ComputedRef<RegisteredTrace> => {
  const trace = inject(TRACE_CONTEXT, undefined);

  if (trace === undefined) {
    throw new TraceError({
      code: "INVALID_CONFIGURATION",
      message: "Trace composables must be used within a TraceProvider.",
    });
  }

  return trace;
};
