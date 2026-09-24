import type { VercelLike } from "src/types/VercelLike";

/**
 * Options for `vercel()`. The application injects Vercel Web Analytics and
 * owns it; Trace only calls it.
 *
 * @example
 * ```ts
 * vercel({ sdk: { track }, limits: { properties: 8 } });
 * ```
 */
export type VercelAdapterOptions<TSdk extends VercelLike> = {
  /** The browser `track` of `@vercel/analytics`, held by an object, or the module itself. */
  sdk: TSdk;
  limits?: {
    /** The custom properties your plan keeps on one event: 2 on Pro, the default, and 8 with Web Analytics Plus or on Enterprise. */
    properties: 2 | 8;
  };
};
