/**
 * Something an event could not carry as given, at the field `path` names, such
 * as `properties.card.cvc` or `timestamp`. The core records redaction, limits and
 * invalid values, and an adapter records what its provider cannot express.
 *
 * @example
 * ```ts
 * const loss: MappingLoss = { path: "timestamp", reason: "unsupported" };
 * ```
 */
export type MappingLoss = {
  path: string;
  reason:
    | "redacted"
    | "truncated"
    | "invalid"
    | "unsupported"
    | "omitted"
    | "coerced";
};
