/** Mixpanel's opt-out deletes the identified user's profile unless `delete_user` is false. */
export const OPT_OUT_OPTIONS: { delete_user: boolean } = Object.freeze({
  delete_user: false,
});

/** Mixpanel's opt-in tracks an `$opt_in` event unless it is given a `track` of its own. */
export const OPT_IN_OPTIONS: { track: () => void } = Object.freeze({
  track: () => {},
});
