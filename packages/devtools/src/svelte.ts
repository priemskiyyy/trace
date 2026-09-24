import { TraceDevtools as Devtools } from "@priemskiyyy/trace-devtools";
import { useTrace } from "@priemskiyyy/trace-svelte";
import type { Attachment } from "svelte/attachments";

import type { TraceDevtoolsProps } from "src/types/TraceDevtoolsProps";
import { DEFAULT_MAX_EVENTS } from "src/utils/constants/defaults";

export type { TraceDevtoolsProps } from "src/types/TraceDevtoolsProps";

/**
 * Creates an attachment that mounts the inspector for the nearest
 * `TraceProvider`, and mounts it again when the provider's Trace changes. Call
 * it while the component initializes; an attachment never runs on the server.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   const devtools = createDevtools();
 * </script>
 *
 * <div {@attach devtools}></div>
 * ```
 */
export const createDevtools = ({
  initialIsOpen = false,
  maxEvents = DEFAULT_MAX_EVENTS,
}: TraceDevtoolsProps = {}): Attachment<HTMLElement> => {
  const trace = useTrace();

  return (element) => {
    const devtools = new Devtools({
      trace: trace.current,
      initialIsOpen,
      maxEvents,
    });

    devtools.mount(element);

    return devtools.unmount;
  };
};
