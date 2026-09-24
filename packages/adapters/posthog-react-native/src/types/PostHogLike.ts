/**
 * The part of a posthog-react-native client the adapter calls. A `PostHog`
 * instance satisfies it, so this package imports no SDK: the application
 * passes in the client it created.
 *
 * @example
 * ```ts
 * import PostHog from "posthog-react-native";
 *
 * const sdk: PostHogLike = new PostHog("phc_project_api_key");
 * ```
 */
export type PostHogLike = {
  /** True for a client created with `disabled: true` or without an API key, which sends and flushes nothing. */
  isDisabled: boolean;
  /** Settles once the client has loaded its storage. Until then it holds no person and reads no memberships. */
  ready: () => Promise<void>;
  /**
   * Queues the event under the person the client holds and answers nothing:
   * an opted-out or disabled client and `before_send` drop it without a word.
   *
   * A method, so that PostHog's JSON-typed properties accept the event's,
   * which are plain JSON by construction but typed `unknown`.
   */
  capture(
    event: string,
    properties?: Record<string, unknown>,
    options?: { timestamp: Date; uuid: string },
  ): void;
  identify: (id: string) => void;
  /**
   * Ignores an empty update, and one identical to the last it sent.
   *
   * A method, so that PostHog's JSON-typed properties accept the traits,
   * which are plain JSON by construction but typed `unknown`.
   */
  setPersonProperties(properties?: Record<string, unknown>): void;
  /** Ignores an empty list. */
  unsetPersonProperties: (names: string[]) => void;
  /**
   * Adds the membership to `$groups`, and sends a `$groupidentify` when the
   * membership is new or properties are passed, an empty object included.
   *
   * A method, so that PostHog's JSON-typed properties accept the group's
   * traits, which are plain JSON by construction but typed `unknown`.
   */
  group(type: string, key: string, properties?: Record<string, unknown>): void;
  /**
   * Reads what the client keeps in its storage; under `"props"`, its super
   * properties, whose `$groups` holds every membership, those it restored
   * included.
   *
   * A method, so that the client's own key enum, whose values are these
   * strings, takes the key the adapter names.
   */
  getPersistedProperty(
    key: string,
  ): { $groups?: Record<string, string | number> } | undefined;
  /** Merges into the super properties, so `$groups` is replaced whole. */
  register: (properties: {
    $groups: Record<string, string | number>;
  }) => Promise<void>;
  /** Starts a new anonymous person and forgets the super properties and the opt-in choice. */
  reset: () => void;
  optIn: () => Promise<void>;
  optOut: () => Promise<void>;
  /** Sends the queue, settles once PostHog accepted it, and rejects with the first batch it refused. */
  flush: () => Promise<void>;
};
