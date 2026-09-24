import type { ConsentDecision } from "@priemskiyyy/trace";
import type { ReadableValue } from "../types/ReadableValue.js";
import type { RegisteredPurpose } from "../types/Register.js";
import { useObservableValue } from "./internal/useObservableValue.svelte.js";
import { useTrace } from "./useTrace.js";

/**
 * Observes the decision for each purpose the `consent` option names through
 * `current`: `unknown`, `granted` or `denied`. It only observes, and reads
 * `unknown` for every purpose on the server and until the component is mounted.
 *
 * @example
 * ```ts
 * const consent = useConsent();
 *
 * const isAsking = $derived(consent.current.analytics === "unknown");
 * ```
 */
export const useConsent = (
  onChange?: (
    decisions: Record<RegisteredPurpose, ConsentDecision>,
  ) => void | Promise<unknown>,
): ReadableValue<Record<RegisteredPurpose, ConsentDecision>> => {
  const trace = useTrace();

  const undecided: Record<RegisteredPurpose, ConsentDecision> = Object.freeze(
    Object.fromEntries(
      Object.keys(trace.current.consent.get()).map(
        (purpose): [string, ConsentDecision] => [purpose, "unknown"],
      ),
    ),
  );

  return useObservableValue<Record<RegisteredPurpose, ConsentDecision>>(
    () => trace.current.consent,
    undecided,
    onChange,
  );
};
