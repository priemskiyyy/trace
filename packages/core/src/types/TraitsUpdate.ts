/**
 * What an adapter's `traits` receives: the traits that changed, the keys to
 * remove, and the user they belong to.
 *
 * @example
 * ```ts
 * traits: ({ set, remove }) => {
 *   sdk.setPersonProperties(set);
 *   sdk.unsetPersonProperties(remove);
 * },
 * ```
 */
export type TraitsUpdate = {
  /** The user the traits belong to, so a server SDK can address the right profile. */
  user: { id: string } | null;
  set: Record<string, unknown>;
  /** Keys to remove, including ones the provider may hold from an earlier session. */
  remove: string[];
};
