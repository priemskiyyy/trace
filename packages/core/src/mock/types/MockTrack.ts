import type { TrackContext } from "src/types/TrackContext";
import type { TrackedEvent } from "src/types/TrackedEvent";
import type { TrackResult } from "src/types/TrackResult";

/**
 * One `track` the mock recorded, and the controls a test answers it with while
 * `hold` is on.
 *
 * @example
 * ```ts
 * mock.tracks[0]?.settle({ status: "failed", error: new Error("offline") });
 * ```
 */
export type MockTrack = {
  event: TrackedEvent;
  context: TrackContext;
  /** Answers the held `track`: `submitted` with `sdk-call-returned` unless told otherwise. */
  settle: (result?: TrackResult) => void;
  /** Rejects the held `track` with the error. */
  fail: (error: unknown) => void;
};
