/** Keys that name a credential, whatever their case or separator; the default redaction. */
export const SENSITIVE_KEY =
  /token|authorization|passw(?:or)?d|secret|cookie|credential|bearer|jwt|session[-_]?id|(?:api|access|private)[-_]?key/i;

/** Keys the sanitizer never copies, because code that merges the data later could reach a prototype through them. */
export const UNSAFE_PROPERTY_KEYS = Object.freeze([
  "__proto__",
  "constructor",
  "prototype",
]);
