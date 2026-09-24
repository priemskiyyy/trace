/** PostHog's own properties begin with `$`: PostHog reads some as instructions, such as `$set` for the person or `$groups` for its groups, and posthog-react-native overwrites others, such as `$session_id`. */
export const RESERVED_PREFIX = "$";

/** PostHog's names for an event's person and project, which its capture API also reads from an event's properties. */
export const RESERVED_PROPERTIES = Object.freeze(["distinct_id", "token"]);

/** The key under which posthog-react-native keeps its super properties, `$groups` among them, in its storage. */
export const SUPER_PROPERTIES_KEY = "props";
