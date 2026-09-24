import { createComponent, createMemo } from "solid-js";
import type { ParentProps } from "solid-js";

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
export type TraceProviderProps = ParentProps<{
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
 * <TraceProvider trace={trace}>
 *   <Application />
 * </TraceProvider>
 * ```
 */
export const TraceProvider = (props: TraceProviderProps) =>
  createComponent(TraceContext.Provider, {
    value: createMemo(() => props.trace),
    get children() {
      return props.children;
    },
  });
