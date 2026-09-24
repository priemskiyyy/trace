/**
 * The furthest boundary a submitted event is known to have reached, from the
 * weakest to the strongest: the SDK call returned, an SDK callback said it was
 * done, or a backend answered for the event.
 *
 * @example
 * ```ts
 * const evidence: TrackEvidence = "sdk-call-returned";
 * ```
 */
export type TrackEvidence =
  "sdk-call-returned" | "sdk-callback-completed" | "backend-acknowledged";
