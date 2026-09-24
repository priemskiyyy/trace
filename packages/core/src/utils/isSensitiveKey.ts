import { SENSITIVE_KEY } from "src/utils/constants/privacy";

/**
 * The default redaction: whether a key names a credential, such as `apiKey`,
 * `Authorization` or `session_id`. Compose it to extend the default.
 *
 * @example
 * ```ts
 * privacy: {
 *   redact: (key, path) =>
 *     isSensitiveKey(key) || key === "iban" || path === "properties.card.cvc",
 * }
 * ```
 */
export const isSensitiveKey = (key: string) => SENSITIVE_KEY.test(key);
