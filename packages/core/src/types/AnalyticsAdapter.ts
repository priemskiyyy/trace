import type { AnalyticsSession } from "src/types/AnalyticsSession";

/**
 * A cold description of one destination: `open` runs when the Trace starts and
 * answers a session over the SDK the application initialized, or throws before
 * it changed anything.
 *
 * @example
 * ```ts
 * const beacon = ({ sdk }: { sdk: Beacon }): AnalyticsAdapter<Beacon> => ({
 *   name: "beacon",
 *   open: () => ({
 *     native: sdk,
 *     track: (event) => {
 *       sdk.send(event.name, event.properties);
 *
 *       return { status: "submitted", evidence: "sdk-call-returned" };
 *     },
 *   }),
 * });
 * ```
 */
export type AnalyticsAdapter<TNative = unknown> = {
  /** For diagnostics only. The core never branches on it. */
  name: string;
  open: () => AnalyticsSession<TNative>;
};
