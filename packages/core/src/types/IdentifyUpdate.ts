/**
 * What an adapter's `identify` receives: the user the provider should hold from now on.
 *
 * @example
 * ```ts
 * identify: ({ user }) => sdk.identify(user.id),
 * ```
 */
export type IdentifyUpdate = { user: { id: string } };
