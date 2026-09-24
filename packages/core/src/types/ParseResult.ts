/**
 * What an event definition's `parse` answers: the properties it accepts, or
 * the issues that drop the event as `invalid`.
 *
 * @example
 * ```ts
 * const cartOpened: EventDefinition<string, { cart: { id: string } }> = {
 *   parse: (id): ParseResult<{ cart: { id: string } }> =>
 *     id === "" ? { ok: false, issues: [{ path: "", message: "Expected a cart id." }] } : { ok: true, properties: { cart: { id } } },
 * };
 * ```
 */
export type ParseResult<TOutput> =
  | { ok: true; properties: TOutput }
  | {
      ok: false;
      /** Each refusal, its `path` dotted, such as `cart.id`, or empty for the properties as a whole. */
      issues: { path: string; message: string }[];
    };
