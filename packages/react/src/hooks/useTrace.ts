import { TraceError } from "@priemskiyyy/trace";
import { useContext } from "react";

import { TraceContext } from "src/context/TraceContext";
import type { RegisteredTrace } from "src/types/Register";

/**
 * Returns the nearest provider's Trace, starting and tracking nothing, and
 * throws when there is no provider. Augment `Register` to type it.
 *
 * @example
 * ```tsx
 * const trace = useTrace();
 *
 * const handleCheckoutPress = () => trace.track("Checkout Started", { cart: { id: cart.id } });
 * ```
 */
export const useTrace = (): RegisteredTrace => {
  const trace = useContext(TraceContext);

  if (trace === undefined) {
    throw new TraceError({
      code: "INVALID_CONFIGURATION",
      message: "Trace hooks must be used within a TraceProvider.",
    });
  }

  return trace;
};
