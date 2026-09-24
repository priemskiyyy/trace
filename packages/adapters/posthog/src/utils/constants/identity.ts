/** posthog-js refuses to identify these ids, compared in lowercase, and logs an error instead. */
export const REFUSED_DISTINCT_IDS = Object.freeze([
  "distinct_id",
  "distinctid",
  "undefined",
  "null",
]);

/** The distinct id posthog-js keeps for a cookieless person, which it refuses to identify in this exact spelling. */
export const COOKIELESS_DISTINCT_ID = "$posthog_cookieless";

/** The `person_profiles` setting under which posthog-js keeps no person and ignores identify, person properties and group properties. */
export const NO_PERSON_PROFILES = "never";

/** PostHog shortens a distinct id past 200 characters to its first 200 when it ingests an event. */
export const MAX_DISTINCT_ID_LENGTH = 200;
