/** PostHog's own properties begin with `$`: posthog-js reads some as instructions, such as `$set` for the person or `$groups` for its groups, and overwrites others. */
export const RESERVED_PREFIX = "$";

/** posthog-js merges an event's properties over these: `distinct_id` would move the event to another person, and `token` is overwritten with the project's. */
export const RESERVED_PROPERTIES = Object.freeze(["distinct_id", "token"]);
