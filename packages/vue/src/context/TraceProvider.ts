import { computed, defineComponent, provide } from "vue";

import { TRACE_CONTEXT } from "src/context/TraceContext";
import type { RegisteredTrace } from "src/types/Register";

/**
 * The props of `TraceProvider`: the Trace it publishes to the components
 * below.
 *
 * @example
 * ```ts
 * const props: TraceProviderProps = { trace };
 * ```
 */
export type TraceProviderProps = {
  trace: RegisteredTrace;
};

/**
 * Publishes one Trace to the components below and does nothing else: whoever
 * constructed it starts and disposes it, so mounting opens nothing and
 * unmounting disposes nothing. Augment `Register` first, or TypeScript refuses
 * a Trace typed by its own events.
 *
 * @example
 * ```vue
 * <TraceProvider :trace="trace">
 *   <Application />
 * </TraceProvider>
 * ```
 */
export const TraceProvider = defineComponent(
  (props: TraceProviderProps, { slots }) => {
    provide(
      TRACE_CONTEXT,
      computed(() => props.trace),
    );

    return () => slots.default?.();
  },
  { name: "TraceProvider", props: { trace: { type: Object, required: true } } },
);
