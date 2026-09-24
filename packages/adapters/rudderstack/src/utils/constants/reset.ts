/** RudderStack's reset keeps the anonymous id unless it is told to clear it too. */
export const RESET_OPTIONS = Object.freeze({
  entries: Object.freeze({ anonymousId: true }),
});

/** Clears only RudderStack's group, whose traits it would otherwise merge into the next group's. */
export const GROUP_RESET_OPTIONS = Object.freeze({
  entries: Object.freeze({
    userId: false,
    userTraits: false,
    groupId: true,
    groupTraits: true,
    sessionInfo: false,
    authToken: false,
  }),
});
