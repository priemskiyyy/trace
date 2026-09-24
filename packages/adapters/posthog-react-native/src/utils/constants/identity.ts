/** PostHog refuses to identify a person by these ids, compared in lowercase, as placeholders that would join unrelated users. */
export const REFUSED_DISTINCT_IDS = Object.freeze([
  "anonymous",
  "guest",
  "distinctid",
  "distinct_id",
  "id",
  "not_authenticated",
  "email",
  "undefined",
  "true",
  "false",
]);

/** PostHog refuses to identify a person by these ids in this exact spelling. */
export const REFUSED_EXACT_DISTINCT_IDS = Object.freeze([
  "[object Object]",
  "NaN",
  "None",
  "none",
  "null",
  "0",
]);

/** PostHog shortens a distinct id past 200 characters to its first 200 when it ingests an event. */
export const MAX_DISTINCT_ID_LENGTH = 200;
