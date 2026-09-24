import type { FlushResult } from "src/types/FlushResult";

/**
 * How far one destination got during `flush`: its provider's own answer,
 * `unsupported` when its session has no flush, or `not-ready` when it is not open.
 *
 * @example
 * ```ts
 * const { destinations } = await trace.flush();
 * const product: DestinationFlushResult | undefined = destinations.product;
 * ```
 */
export type DestinationFlushResult =
  FlushResult | { status: "unsupported" } | { status: "not-ready" };
