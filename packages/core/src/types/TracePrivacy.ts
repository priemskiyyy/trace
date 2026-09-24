import type { TraceLimits } from "src/types/TraceLimits";

/**
 * What must never leave the application, applied to properties, context, traits
 * and group traits before anything is kept, observed or sent.
 *
 * @example
 * ```ts
 * privacy: { redact: (key, path) => isSensitiveKey(key) || path === "properties.card.cvc" },
 * ```
 */
export type TracePrivacy = {
  /** Removes each key it names, asked with the key's dotted path. `isSensitiveKey` by default; one that throws drops the event. */
  redact?: (key: string, path: string) => boolean;
  limits?: Partial<TraceLimits>;
};
