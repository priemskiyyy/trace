/**
 * The part of RudderStack's JavaScript SDK the adapter calls. The
 * `RudderAnalytics` instance the application created satisfies it, so this
 * package imports no SDK.
 *
 * @example
 * ```ts
 * import { RudderAnalytics } from "@rudderstack/analytics-js";
 *
 * const rudderanalytics = new RudderAnalytics();
 *
 * rudderanalytics.load(writeKey, dataPlaneUrl);
 *
 * const sdk: RudderStackLike = rudderanalytics;
 * ```
 */
export type RudderStackLike = {
  /** A method, so that RudderStack's optional, nullable `ApiObject` takes the sanitized properties, JSON by construction but typed `unknown`. */
  track(
    name: string,
    properties: Record<string, unknown> | null | undefined,
    options: { originalTimestamp: string },
  ): unknown;
  /** A method, so that RudderStack's forms, a user id with its traits and traits alone, both satisfy it. An id without traits clears the traits it holds. */
  identify(
    idOrTraits: string | Record<string, unknown>,
    traits?: Record<string, unknown> | null,
  ): unknown;
  /** A method, so that RudderStack's optional, nullable traits take the group's traits, JSON by construction but typed `unknown`. */
  group(
    id: string,
    traits: Record<string, unknown> | null | undefined,
  ): unknown;
  /** Clears what `entries` marks true, and by default everything but the anonymous id. */
  reset: (options: {
    entries: {
      anonymousId?: boolean;
      userId?: boolean;
      userTraits?: boolean;
      groupId?: boolean;
      groupTraits?: boolean;
      sessionInfo?: boolean;
      authToken?: boolean;
    };
  }) => unknown;
};
