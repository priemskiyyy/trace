/**
 * The two commands of the `gtag` function the adapter sends. The function the
 * Google tag snippet defines satisfies it, so this package imports nothing:
 * the application passes in its own `gtag`.
 *
 * @example
 * ```ts
 * const sdk: GtagLike = window.gtag;
 * ```
 */
export type GtagLike = {
  /** Queues one event for the targets its `send_to` names. */
  (command: "event", name: string, parameters: Record<string, unknown>): void;
  /** With `update: true`, changes the user of a measurement the page configured; `send_page_view: false` keeps a first `config` from sending a `page_view`. */
  (
    command: "config",
    target: string,
    parameters: {
      update: true;
      send_page_view?: false;
      user_id?: string | null;
      user_properties?: Record<string, unknown>;
    },
  ): void;
};
