import { TraceError } from "@priemskiyyy/trace";
import { useContext } from "solid-js";
import type { Accessor } from "solid-js";

import { TraceContext } from "src/context/TraceContext";
import type { RegisteredTrace } from "src/types/Register";

/**
 * Follows the nearest provider's Trace as an accessor, starting and tracking
 * nothing, and throws when there is no provider. Augment `Register` to type it.
 *
 * @example
 * ```tsx
 * const trace = useTrace();
 *
 * const handleCheckoutClick = () => trace().track("Checkout Started", { cart: { id: cart.id } });
 * ```
 */
export const useTrace = (): Accessor<RegisteredTrace> => {
  const trace = useContext(TraceContext);

  if (trace === undefined) {
    throw new TraceError({
      code: "INVALID_CONFIGURATION",
      message: "Trace primitives must be used within a TraceProvider.",
    });
  }

  return trace;
};
