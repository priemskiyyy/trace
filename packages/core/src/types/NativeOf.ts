import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { Destinations } from "src/types/Destinations";

/**
 * The injected SDK type of each named destination, which
 * `destination(name).native` keeps.
 *
 * @example
 * ```ts
 * const sdk: NativeOf<typeof destinations>["research"] | null = trace.destination("research").native;
 * ```
 */
export type NativeOf<TDestinations extends Destinations> = {
  [TName in keyof TDestinations]: TDestinations[TName] extends AnalyticsAdapter<
    infer TNative
  >
    ? TNative
    : never;
};
