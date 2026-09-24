import type { ConsentDecision } from "@priemskiyyy/trace";
import type { ComputedRef } from "vue";

import { useObservableValue } from "src/composables/internal/useObservableValue";
import { useTrace } from "src/composables/useTrace";
import type { RegisteredPurpose } from "src/types/Register";

/**
 * Observes the decision for each purpose the `consent` option names as a
 * read-only ref: `unknown`, `granted` or `denied`. It only observes, and reads
 * `unknown` for every purpose on the server and until the component is mounted.
 *
 * @example
 * ```ts
 * const consent = useConsent();
 *
 * const isAsking = computed(() => consent.value.analytics === "unknown");
 * ```
 */
export const useConsent = (
  onChange?: (
    decisions: Record<RegisteredPurpose, ConsentDecision>,
  ) => void | Promise<unknown>,
): ComputedRef<Record<RegisteredPurpose, ConsentDecision>> => {
  const trace = useTrace();

  const undecided: Record<RegisteredPurpose, ConsentDecision> = Object.freeze(
    Object.fromEntries(
      Object.keys(trace.value.consent.get()).map(
        (purpose): [string, ConsentDecision] => [purpose, "unknown"],
      ),
    ),
  );

  return useObservableValue<Record<RegisteredPurpose, ConsentDecision>>(
    () => trace.value.consent,
    undecided,
    onChange,
  );
};
