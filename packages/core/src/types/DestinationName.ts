import type { Destinations } from "src/types/Destinations";

/**
 * The names an application registered its destinations under.
 *
 * @example
 * ```ts
 * const name: DestinationName<typeof destinations> = "product";
 * ```
 */
export type DestinationName<TDestinations extends Destinations> =
  keyof TDestinations & string;
