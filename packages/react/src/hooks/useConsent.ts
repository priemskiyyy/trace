import type { ConsentDecision } from "@priemskiyyy/trace";
import { useMemo } from "react";

import { useObservableValue } from "src/hooks/internal/useObservableValue";
import { useTrace } from "src/hooks/useTrace";
import type { RegisteredPurpose } from "src/types/Register";

/**
 * Observes the decision for each purpose the `consent` option names:
 * `unknown`, `granted` or `denied`. It only observes, and reads `unknown` for
 * every purpose on the server and during hydration.
 *
 * @example
 * ```tsx
 * const consent = useConsent();
 *
 * if (consent.analytics === "unknown") return <ConsentBanner />;
 * ```
 */
export const useConsent = (
  onChange?: (
    decisions: Record<RegisteredPurpose, ConsentDecision>,
  ) => void | Promise<unknown>,
): Record<RegisteredPurpose, ConsentDecision> => {
  const { consent } = useTrace();

  const undecided = useMemo(
    (): Record<RegisteredPurpose, ConsentDecision> =>
      Object.freeze(
        Object.fromEntries(
          Object.keys(consent.get()).map(
            (purpose): [string, ConsentDecision] => [purpose, "unknown"],
          ),
        ),
      ),
    [consent],
  );

  return useObservableValue(consent, () => undecided, onChange);
};
