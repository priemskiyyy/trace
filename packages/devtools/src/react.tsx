import { TraceDevtools as Devtools } from "@priemskiyyy/trace-devtools";
import { useTrace } from "@priemskiyyy/trace-react";
import { createElement, useCallback, useEffect, useState } from "react";

import type { TraceDevtoolsProps } from "src/types/TraceDevtoolsProps";
import { DEFAULT_MAX_EVENTS } from "src/utils/constants/defaults";

export type { TraceDevtoolsProps } from "src/types/TraceDevtoolsProps";

/**
 * Mounts the inspector for the nearest `TraceProvider` and follows its Trace.
 * It renders an empty host element on the server and removes the inspector
 * when it unmounts.
 *
 * @example
 * ```tsx
 * <TraceProvider trace={trace}>
 *   <Application />
 *   {import.meta.env.DEV ? <TraceDevtools /> : null}
 * </TraceProvider>
 * ```
 */
export const TraceDevtools = ({
  initialIsOpen = false,
  maxEvents = DEFAULT_MAX_EVENTS,
}: TraceDevtoolsProps) => {
  const trace = useTrace();

  const [devtools] = useState(
    () => new Devtools({ trace, initialIsOpen, maxEvents }),
  );

  useEffect(() => {
    devtools.setTrace(trace);
  }, [devtools, trace]);

  useEffect(() => {
    devtools.setMaxEvents(maxEvents);
  }, [devtools, maxEvents]);

  // Stable, so a rerender keeps the mounted inspector. React 19 calls the returned cleanup, never this with null.
  const handleHostRef = useCallback(
    (element: HTMLDivElement) => {
      devtools.mount(element);

      return devtools.unmount;
    },
    [devtools],
  );

  return createElement("div", {
    ref: handleHostRef,
    "data-trace-devtools": "",
  });
};
