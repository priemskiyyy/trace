import type { StandardSchema } from "src/types/StandardSchema";

/**
 * Validators for traits and group traits. Each value is validated when it is
 * set, and a key the schema does not declare is refused.
 *
 * @example
 * ```ts
 * const schema = {
 *   traits: { plan: z.enum(["free", "pro"]) },
 *   groups: { workspace: { plan: z.string() } },
 * } satisfies TraceSchema;
 * ```
 */
export type TraceSchema = {
  traits?: Record<string, StandardSchema<unknown, unknown>>;
  /** For each group type, a validator per group trait. */
  groups?: Record<string, Record<string, StandardSchema<unknown, unknown>>>;
};
