import { TraceDevtools as Devtools } from "@priemskiyyy/trace-devtools";
import { useTrace } from "@priemskiyyy/trace-vue";
import {
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  shallowRef,
  watch,
} from "vue";

import type { TraceDevtoolsProps } from "src/types/TraceDevtoolsProps";
import { DEFAULT_MAX_EVENTS } from "src/utils/constants/defaults";

export type { TraceDevtoolsProps } from "src/types/TraceDevtoolsProps";

/**
 * Mounts the inspector for the nearest `TraceProvider` and follows its Trace.
 * It renders an empty host element on the server and removes the inspector
 * when it unmounts.
 *
 * @example
 * ```vue
 * <TraceProvider :trace="trace">
 *   <Application />
 *   <TraceDevtools v-if="isDevelopment" />
 * </TraceProvider>
 * ```
 */
export const TraceDevtools = defineComponent(
  (props: TraceDevtoolsProps) => {
    const trace = useTrace();
    const host = shallowRef<HTMLDivElement | null>(null);

    const devtools = new Devtools({
      trace: trace.value,
      initialIsOpen: props.initialIsOpen ?? false,
      maxEvents: props.maxEvents ?? DEFAULT_MAX_EVENTS,
    });

    watch(trace, (current) => devtools.setTrace(current));
    watch(
      () => props.maxEvents ?? DEFAULT_MAX_EVENTS,
      (maxEvents) => devtools.setMaxEvents(maxEvents),
    );
    onMounted(() => {
      const element = host.value;

      // Mounted means rendered, so the template ref always holds the host here.
      if (element === null) {
        return;
      }

      devtools.mount(element);
    });
    onUnmounted(devtools.unmount);

    return () => h("div", { ref: host, "data-trace-devtools": "" });
  },
  {
    name: "TraceDevtools",
    // An explicit undefined default keeps an absent prop absent, so Vue does not cast it to false.
    props: {
      initialIsOpen: { type: Boolean, default: undefined },
      maxEvents: { type: Number, default: undefined },
    },
  },
);
