/** Identities heap.js 5 ignores, compared exactly, because they name no one. */
export const REFUSED_IDENTITIES = Object.freeze([
  "undefined",
  "anonymous",
  "true",
  "false",
  "not_authenticated",
  "NaN",
  "NA",
  "Na",
  "unique_identifier",
  "0",
  '""',
  "[object Object]",
  "{{ customer.email }}",
  "{{ email }}",
  "hashed_user_id",
]);

/** Identities heap.js 5 ignores in any letter case. */
export const REFUSED_IDENTITY_NAMES = /^(?:email|none|unknown|guest|null)$/i;
