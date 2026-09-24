import { TraceDevtools as Devtools } from "@priemskiyyy/trace-devtools";
import { useTrace } from "@priemskiyyy/trace-solid";
import { createEffect, onCleanup, onMount } from "solid-js";
import { isServer } from "solid-js/web";

import type { TraceDevtoolsProps } from "src/types/TraceDevtoolsProps";
import { DEFAULT_MAX_EVENTS } from "src/utils/constants/defaults";

export type { TraceDevtoolsProps } from "src/types/TraceDevtoolsProps";

/**
 * Mounts the inspector for the nearest `TraceProvider` and follows its Trace.
 * It renders nothing on the server and removes the inspector on cleanup.
 *
 * @example
 * ```tsx
 * <TraceProvider trace={trace}>
 *   <Application />
 *   {import.meta.env.DEV ? <TraceDevtools /> : null}
 * </TraceProvider>
 * ```
 */
export const TraceDevtools = (props: TraceDevtoolsProps) => {
  if (isServer) {
    return null;
  }

  const trace = useTrace();

  const devtools = new Devtools({
    trace: trace(),
    initialIsOpen: props.initialIsOpen ?? false,
  });

  const host = document.createElement("div");

  host.dataset.traceDevtools = "";

  createEffect(() => devtools.setTrace(trace()));
  createEffect(() =>
    devtools.setMaxEvents(props.maxEvents ?? DEFAULT_MAX_EVENTS),
  );
  onMount(() => devtools.mount(host));
  onCleanup(devtools.unmount);

  return host;
};
