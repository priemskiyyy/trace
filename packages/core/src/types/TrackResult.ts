import type { MappingLoss } from "src/types/MappingLoss";
import type { TrackEvidence } from "src/types/TrackEvidence";

/**
 * What an adapter answers for one event. Throwing or rejecting reads as
 * `failed`, and running past the timeout as `indeterminate`, so an adapter states
 * only what it knows.
 *
 * @example
 * ```ts
 * track: (event) => {
 *   const uuid = sdk.capture(event.name, event.properties);
 *
 *   return uuid === undefined
 *     ? { status: "dropped", reason: "provider-filtered" }
 *     : { status: "submitted", evidence: "sdk-call-returned", event: { id: uuid } };
 * },
 * ```
 */
export type TrackResult =
  | {
      status: "submitted";
      evidence: TrackEvidence;
      /** The provider's reference for the event, when it hands one out. */
      event?: { id: string } | null;
      /** What this provider could not carry. The core adds the sanitizer's losses once. */
      losses?: MappingLoss[];
    }
  | { status: "dropped"; reason: "provider-filtered"; losses?: MappingLoss[] }
  | {
      status: "skipped";
      reason: "auth-subject-mismatch" | "unidentified" | "unsupported";
    }
  | { status: "failed"; error: unknown }
  | { status: "indeterminate"; reason: "ambiguous" };
