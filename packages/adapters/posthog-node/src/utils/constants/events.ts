/** PostHog's own events that name a person or merge one into another, which Trace does through identify only. */
export const IDENTITY_EVENTS = Object.freeze([
  "$identify",
  "$create_alias",
  "$merge_dangerously",
]);
