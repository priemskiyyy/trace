/**
 * The part of the Umami tracker the adapter calls: `window.umami`, which the
 * tracker script defines when it runs and not before.
 *
 * @example
 * ```ts
 * const sdk: UmamiLike = window.umami;
 * ```
 */
export type UmamiLike = {
  /**
   * The function form: Umami passes it the page's own payload and sends what
   * it returns. The promise settles after the request, a failed one too.
   */
  track: (
    event: (payload: { website: string }) => {
      website: string;
      name?: string;
      data?: Record<string, unknown>;
      id?: string | undefined;
    },
  ) => Promise<void>;
};
