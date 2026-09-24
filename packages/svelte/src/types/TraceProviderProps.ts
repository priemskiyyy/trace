import type { Snippet } from "svelte";
import type { RegisteredTrace } from "./Register.js";

/**
 * The props of `TraceProvider`: the Trace it publishes and the content that
 * reads it.
 *
 * @example
 * ```ts
 * const props: TraceProviderProps = { trace };
 * ```
 */
export type TraceProviderProps = {
  trace: RegisteredTrace;
  children?: Snippet | undefined;
};
