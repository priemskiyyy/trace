import type { DestinationStatus } from "src/types/DestinationStatus";
import type { ObservableValue } from "src/types/ObservableValue";

/**
 * The escape hatch to one destination: its status, and the SDK it was given.
 * Calls made on `native` bypass Trace's routing, consent, receipts and redaction.
 *
 * @example
 * ```ts
 * const research: DestinationHandle<PostHog> = trace.destination("research");
 * research.native?.reloadFeatureFlags();
 * ```
 */
export type DestinationHandle<TNative> = {
  status: ObservableValue<DestinationStatus>;
  /** The injected SDK once the destination is ready, and `null` before. */
  native: TNative | null;
};
