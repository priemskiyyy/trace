import type { MappingLoss } from "src/types/MappingLoss";
import type { TrackEvidence } from "src/types/TrackEvidence";

/**
 * What happened to one event at one destination. `submitted` claims only the
 * boundary its `evidence` names, and `indeterminate` means the event may still
 * have been sent.
 *
 * @example
 * ```ts
 * const status = await trace.track("App Opened").settled;
 *
 * if (status.state === "settled" && status.outcomes.product?.status === "failed") {
 *   showOfflineBanner();
 * }
 * ```
 */
export type DestinationOutcome =
  | {
      status: "submitted";
      evidence: TrackEvidence;
      /** The provider's reference for the event, when it hands one out. */
      event: { id: string } | null;
      /** What the sanitizer and the adapter could not carry, each once. */
      losses: MappingLoss[];
    }
  | { status: "dropped"; reason: "provider-filtered"; losses: MappingLoss[] }
  | {
      status: "dropped";
      reason:
        | "consent"
        | "buffer-overflow"
        | "buffer-expired"
        | "identity-changed"
        | "disposed";
    }
  | {
      status: "skipped";
      reason:
        | "start-failed"
        | "identity-failed"
        | "auth-subject-mismatch"
        | "unidentified"
        | "unsupported";
    }
  | { status: "failed"; error: unknown }
  | { status: "indeterminate"; reason: "timeout" | "disposed" | "ambiguous" };
