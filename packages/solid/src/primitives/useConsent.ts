import type { ConsentDecision } from "@priemskiyyy/trace";
import type { Accessor } from "solid-js";

import { useObservableValue } from "src/primitives/internal/useObservableValue";
import { useTrace } from "src/primitives/useTrace";
import type { RegisteredPurpose } from "src/types/Register";

/**
 * Observes the decision for each purpose the `consent` option names as an
 * accessor: `unknown`, `granted` or `denied`. It only observes, and reads
 * `unknown` for every purpose on the server and until the component is mounted.
 *
 * @example
 * ```tsx
 * const consent = useConsent();
 *
 * <Show when={consent().analytics === "unknown"}><ConsentBanner /></Show>;
 * ```
 */
export const useConsent = (
  onChange?: (
    decisions: Record<RegisteredPurpose, ConsentDecision>,
  ) => void | Promise<unknown>,
): Accessor<Record<RegisteredPurpose, ConsentDecision>> => {
  const trace = useTrace();

  const undecided: Record<RegisteredPurpose, ConsentDecision> = Object.freeze(
    Object.fromEntries(
      Object.keys(trace().consent.get()).map(
        (purpose): [string, ConsentDecision] => [purpose, "unknown"],
      ),
    ),
  );

  return useObservableValue<Record<RegisteredPurpose, ConsentDecision>>(
    () => trace().consent,
    undecided,
    onChange,
  );
};
