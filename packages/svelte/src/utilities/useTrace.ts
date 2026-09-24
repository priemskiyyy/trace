import { TraceError } from "@priemskiyyy/trace";
import { getContext } from "svelte";
import { TRACE_CONTEXT } from "../context/TraceContext.js";
import type { ReadableValue } from "../types/ReadableValue.js";
import type { RegisteredTrace } from "../types/Register.js";

/**
 * Follows the nearest provider's Trace through `current`, starting and
 * tracking nothing, and throws when there is no provider. Augment `Register`
 * to type it.
 *
 * @example
 * ```ts
 * const trace = useTrace();
 *
 * const handleCheckoutClick = () => trace.current.track("Checkout Started", { cart: { id: cart.id } });
 * ```
 */
export const useTrace = (): ReadableValue<RegisteredTrace> => {
  const trace = getContext<ReadableValue<RegisteredTrace> | undefined>(
    TRACE_CONTEXT,
  );

  if (trace === undefined) {
    throw new TraceError({
      code: "INVALID_CONFIGURATION",
      message: "Trace utilities must be used within a TraceProvider.",
    });
  }

  return trace;
};
