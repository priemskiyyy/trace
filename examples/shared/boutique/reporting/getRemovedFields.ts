import type { DestinationOutcome } from "@priemskiyyy/trace";

import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";

/**
 * The losses every submitted destination reports alike. Trace redacts and
 * truncates before any destination sees an event, so those are its own;
 * whatever only one destination reports is that adapter's mapping.
 */
export const getRemovedFields = (
  outcomes: Partial<Record<BoutiqueDestination, DestinationOutcome | null>>,
) => {
  const reported = Object.values(outcomes).flatMap((outcome) => {
    if (outcome?.status !== "submitted") {
      return [];
    }

    return [outcome.losses];
  });

  const [first, ...rest] = reported;

  if (first === undefined) {
    return [];
  }

  return first.flatMap((loss) => {
    const shared = rest.every((losses) =>
      losses.some(
        (other) => other.path === loss.path && other.reason === loss.reason,
      ),
    );

    if (!shared) {
      return [];
    }

    return [loss];
  });
};
