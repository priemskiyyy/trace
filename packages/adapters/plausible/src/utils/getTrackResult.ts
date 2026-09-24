import { TraceError } from "@priemskiyyy/trace";
import type { MappingLoss, TrackResult } from "@priemskiyyy/trace";

export const getTrackResult = (
  result: { status: number } | { error: unknown } | undefined,
  losses: MappingLoss[],
): TrackResult => {
  if (result === undefined) {
    return { status: "dropped", reason: "provider-filtered", losses };
  }

  if ("error" in result) {
    return { status: "failed", error: result.error };
  }

  if (result.status < 200 || result.status > 299) {
    return {
      status: "failed",
      error: new TraceError({
        code: "DELIVERY_FAILED",
        message: `Plausible answered the event with the status ${result.status}.`,
      }),
    };
  }

  // Plausible answers 202 to an event it drops too, so the callback proves no more than this.
  return { status: "submitted", evidence: "sdk-callback-completed", losses };
};
