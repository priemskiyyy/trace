/** The `cookieless_mode` settings under which posthog-js ignores opting in and out, or replaces the person on a consent change. */
export const COOKIELESS_MODES = Object.freeze(["always", "on_reject"]);

/** Opts in without the `$opt_in` event posthog-js would otherwise capture. */
export const OPT_IN_OPTIONS: { captureEventName: false } = Object.freeze({
  captureEventName: false,
});
