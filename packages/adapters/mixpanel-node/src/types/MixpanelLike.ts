/**
 * The part of the mixpanel Node client the adapter calls. The client
 * `Mixpanel.init` returns satisfies it, so this package imports no SDK: the
 * application passes in the one it created.
 *
 * @example
 * ```ts
 * import Mixpanel from "mixpanel";
 *
 * const client = Mixpanel.init("YOUR_PROJECT_TOKEN");
 * const sdk: MixpanelLike = client;
 * ```
 */
export type MixpanelLike = {
  /**
   * Sends the event as one request, after adding its own keys to the object
   * it is given. The callback gets nothing once Mixpanel accepted it, and an
   * error otherwise.
   */
  track: (
    name: string,
    properties: Record<string, unknown>,
    callback: (error: Error | undefined) => void,
  ) => void;
  people: {
    /** Moves an `ip` and an `$ignore_time` key out of the object it is given, into the request's own fields. */
    set: (
      distinctId: string,
      properties: Record<string, unknown>,
      callback: (error: Error | undefined) => void,
    ) => void;
    unset: (
      distinctId: string,
      names: string[],
      callback: (error: Error | undefined) => void,
    ) => void;
  };
  groups: {
    /** Moves an `ip` and an `$ignore_time` key out of the object it is given, into the request's own fields. */
    set: (
      key: string,
      id: string,
      properties: Record<string, unknown>,
      callback: (error: Error | undefined) => void,
    ) => void;
    unset: (
      key: string,
      id: string,
      names: string[],
      callback: (error: Error | undefined) => void,
    ) => void;
  };
};
