/**
 * The part of a posthog-js instance the adapter calls. The default export of
 * `posthog-js`, or an instance from `new PostHog()`, satisfies it, so this
 * package imports no SDK: the application passes in the one it initialized.
 *
 * @example
 * ```ts
 * import posthogJs from "posthog-js";
 *
 * const sdk: PostHogLike = posthogJs;
 * ```
 */
export type PostHogLike = {
  /** Set by `posthog.init`. Before it, every call is ignored. */
  __loaded: boolean;
  config: {
    /** `always` ignores opting in and out; `on_reject` replaces the person on a consent change. */
    cookieless_mode?: string;
    /** Under `never`, posthog-js ignores identify, person properties and group properties. */
    person_profiles?: string;
    /** posthog-js cuts every string it sends past this length. */
    properties_string_max_length: number;
  };
  /** Answers `undefined` when posthog-js drops the event: opted out, a bot, rate limited or `before_send`. */
  capture: (
    event: string,
    properties: Record<string, unknown>,
    options: { timestamp: Date; uuid: string },
  ) => { uuid: string } | undefined;
  identify: (id: string) => unknown;
  setPersonProperties: (properties: Record<string, unknown>) => unknown;
  unsetPersonProperties: (names: string[]) => unknown;
  /** Adds the membership to `$groups`, and sends the group's properties when it has any. */
  group: (
    type: string,
    key: string,
    properties?: Record<string, unknown>,
  ) => unknown;
  /** The memberships posthog-js holds, those it restored from its storage included. */
  getGroups: () => Record<string, unknown>;
  /** Replaces the `$groups` super property whole. */
  register: (properties: { $groups: Record<string, unknown> }) => unknown;
  /** Starts a new anonymous person, clears the super properties and returns consent to the configured default. */
  reset: () => unknown;
  opt_in_capturing: (options: { captureEventName: false }) => unknown;
  opt_out_capturing: () => unknown;
};
