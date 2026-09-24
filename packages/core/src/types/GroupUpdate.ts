/**
 * What an adapter's `group` receives: the membership to set for one group
 * type, or an `id` of `null` to leave it, and the user it belongs to.
 *
 * @example
 * ```ts
 * group: ({ group }) =>
 *   group.id === null ? sdk.leave(group.type) : sdk.join(group.type, group.id, group.traits),
 * ```
 */
export type GroupUpdate = {
  /** The user the membership belongs to, so a server SDK can address the right profile. */
  user: { id: string } | null;
  group: { type: string; id: string | null; traits: Record<string, unknown> };
};
