import { TraceError } from "@priemskiyyy/trace";
import { createComponent, createSignal } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import { render } from "solid-js/web";

import { Devtools } from "src/components/Devtools";
import type { ObservedTrace } from "src/types/internal/ObservedTrace";
import type { TraceDevtoolsOptions } from "src/types/TraceDevtoolsOptions";
import { DEFAULT_MAX_EVENTS } from "src/utils/constants/defaults";
import { EventLog } from "src/utils/EventLog";

/**
 * A framework-independent inspector for one Trace, rendered in a shadow root
 * so host styles never leak in or out. It reads `trace.diagnostics` and
 * `trace.events` and nothing else, so it never starts the Trace, opens a
 * destination or tracks an event, and it shows no value until asked.
 *
 * @example
 * ```ts
 * const devtools = new TraceDevtools({ trace, initialIsOpen: false, maxEvents: 200 });
 *
 * devtools.mount(document.body.appendChild(document.createElement("div")));
 * ```
 */
export class TraceDevtools {
  #trace: Accessor<ObservedTrace>;
  #setTrace: Setter<ObservedTrace>;
  #maxEvents: Accessor<number>;
  #setMaxEvents: Setter<number>;
  #initialIsOpen: boolean;
  #log = new EventLog();
  #dispose: (() => void) | null = null;

  constructor({
    trace,
    initialIsOpen = false,
    maxEvents = DEFAULT_MAX_EVENTS,
  }: TraceDevtoolsOptions) {
    const [currentTrace, setTrace] = createSignal(trace);
    const [currentMaxEvents, setMaxEvents] = createSignal(maxEvents);

    this.#trace = currentTrace;
    this.#setTrace = setTrace;
    this.#maxEvents = currentMaxEvents;
    this.#setMaxEvents = setMaxEvents;
    this.#initialIsOpen = initialIsOpen;
  }

  /**
   * Renders the panel into a shadow root of `element`, which must be an
   * element that can host one, such as a `div`, and starts recording. Mounting
   * again before `unmount()` throws a `TraceError`.
   *
   * @example
   * ```ts
   * devtools.mount(document.body.appendChild(document.createElement("div")));
   * ```
   */
  mount = (element: HTMLElement) => {
    if (this.#dispose !== null) {
      throw new TraceError({
        code: "INVALID_CONFIGURATION",
        message: "Trace devtools are already mounted. Call unmount() first.",
      });
    }

    const root = element.shadowRoot ?? element.attachShadow({ mode: "open" });

    this.#dispose = render(
      () =>
        createComponent(Devtools, {
          trace: this.#trace,
          maxEvents: this.#maxEvents,
          initialIsOpen: this.#initialIsOpen,
          log: this.#log,
        }),
      root,
    );
  };

  /**
   * Removes the panel and stops recording. Recorded events survive until the
   * next mount, and unmounting twice does nothing.
   *
   * @example
   * ```ts
   * devtools.unmount();
   * ```
   */
  unmount = () => {
    if (this.#dispose === null) {
      return;
    }

    this.#dispose();
    this.#dispose = null;
  };

  /**
   * Points the inspector at another Trace, for example after the application
   * replaced its own.
   *
   * @example
   * ```ts
   * devtools.setTrace(nextTrace);
   * ```
   */
  setTrace = (trace: ObservedTrace) => {
    this.#setTrace(() => trace);
  };

  /**
   * Changes how many events are kept, clamped to 1 to 1000. The oldest beyond
   * the new limit are forgotten.
   *
   * @example
   * ```ts
   * devtools.setMaxEvents(500);
   * ```
   */
  setMaxEvents = (maxEvents: number) => {
    this.#setMaxEvents(maxEvents);
  };
}
