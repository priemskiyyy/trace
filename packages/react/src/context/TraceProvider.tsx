import type { PropsWithChildren } from "react";

import { TraceContext } from "src/context/TraceContext";
import type { RegisteredTrace } from "src/types/Register";

/**
 * The props of `TraceProvider`: the Trace it publishes and the tree that
 * reads it.
 *
 * @example
 * ```tsx
 * const props: TraceProviderProps = { trace, children: <Application /> };
 * ```
 */
export type TraceProviderProps = PropsWithChildren<{
  trace: RegisteredTrace;
}>;

/**
 * Publishes one Trace to the tree below and does nothing else: whoever
 * constructed it starts and disposes it, so mounting opens nothing and
 * unmounting disposes nothing. Augment `Register` first, or TypeScript refuses
 * a Trace typed by its own events.
 *
 * @example
 * ```tsx
 * export const trace = new Trace({ events, destinations: { product: amplitude({ sdk: Amplitude, Identify: Amplitude.Identify }) } });
 *
 * declare module "@priemskiyyy/trace-react" {
 *   interface Register {
 *     trace: typeof trace;
 *   }
 * }
 *
 * trace.start();
 *
 * <TraceProvider trace={trace}>
 *   <Application />
 * </TraceProvider>
 * ```
 */
export const TraceProvider = ({ trace, children }: TraceProviderProps) => (
  <TraceContext.Provider value={trace}>{children}</TraceContext.Provider>
);
