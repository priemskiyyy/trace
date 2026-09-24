/**
 * Whom one analytics-node call is for: a user id, an anonymous id, or both.
 * analytics-node refuses a call that carries neither, so the type cannot say it.
 *
 * @example
 * ```ts
 * const identity: SegmentIdentity = { userId: "user_42", anonymousId: "visitor_7" };
 * ```
 */
export type SegmentIdentity =
  | { userId: string; anonymousId?: string }
  | { userId?: string; anonymousId: string };
