/** PostHog's own properties begin with `$`: PostHog reads some as instructions, such as `$set` for the person or `$groups` for the event's groups, and posthog-node overwrites others, such as `$lib`. */
export const RESERVED_PREFIX = "$";

/** PostHog's names for an event's person and project, which PostHog's capture API and its own SDKs carry in an event's properties. */
export const RESERVED_PROPERTIES = Object.freeze(["distinct_id", "token"]);
