import { TraceProvider } from "@priemskiyyy/trace-solid";
import type { RegisteredTrace } from "@priemskiyyy/trace-solid";
import { fireEvent, within } from "@testing-library/dom";
import { cleanup, render } from "@solidjs/testing-library";
import { createComponent, createSignal } from "solid-js";
import { afterEach, expect, test } from "vitest";

import { createTrace } from "src/createTrace.fixture";
import { TraceDevtools } from "src/solid";
import { spyOnTrace } from "src/spyOnTrace.fixture";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the Solid wrapper mounts the inspector for the provider's Trace, follows another and a new event limit, and removes it on cleanup", async () => {
  const first = createTrace();
  const second = createTrace();
  const firstSpy = spyOnTrace(first.trace);
  const secondSpy = spyOnTrace(second.trace);
  const [trace, setTrace] = createSignal<RegisteredTrace>(first.trace);
  const [maxEvents, setMaxEvents] = createSignal(10);

  const { container, unmount } = render(() =>
    createComponent(TraceProvider, {
      get trace() {
        return trace();
      },
      get children() {
        return createComponent(TraceDevtools, {
          initialIsOpen: true,
          get maxEvents() {
            return maxEvents();
          },
        });
      },
    }),
  );

  const host = container.querySelector("[data-trace-devtools]");
  const root = host?.shadowRoot?.firstElementChild;

  if (!(root instanceof HTMLElement)) {
    throw new Error("Expected the devtools root inside the shadow root");
  }

  expect(
    within(root).getByRole("complementary", { name: "Trace devtools" }).tagName,
  ).toBe("ASIDE");
  expect(firstSpy.live).toEqual({
    diagnostics: 1,
    "diagnostics.events": 1,
    events: 1,
  });

  setTrace(() => second.trace);
  setMaxEvents(1);
  second.trace.start();
  await nextMacrotask();

  expect(firstSpy.live).toEqual({
    diagnostics: 0,
    "diagnostics.events": 0,
    events: 0,
  });
  expect(secondSpy.live).toEqual({
    diagnostics: 1,
    "diagnostics.events": 1,
    events: 1,
  });
  expect(
    Array.from(
      within(root)
        .getByLabelText("Event timeline")
        .querySelectorAll(".event-type"),
      (type) => type.textContent,
    ),
  ).toEqual(["destination ready"]);

  unmount();

  expect(secondSpy.live).toEqual({
    diagnostics: 0,
    "diagnostics.events": 0,
    events: 0,
  });
  expect(host?.shadowRoot?.childElementCount).toBe(0);
  expect(first.mock.sessions).toEqual([]);
});

test("without props the inspector starts closed and keeps more than one event", async () => {
  const { trace } = createTrace();

  const { container, unmount } = render(() =>
    createComponent(TraceProvider, {
      trace,
      get children() {
        return createComponent(TraceDevtools, {});
      },
    }),
  );

  const root = container.querySelector("[data-trace-devtools]")?.shadowRoot
    ?.firstElementChild;

  if (!(root instanceof HTMLElement)) {
    throw new Error("Expected the devtools root inside the shadow root");
  }

  fireEvent.click(
    within(root).getByRole("button", { name: "Open Trace devtools" }),
  );
  trace.start();
  await nextMacrotask();

  expect(
    Array.from(
      within(root)
        .getByLabelText("Event timeline")
        .querySelectorAll(".event-type"),
      (type) => type.textContent,
    ),
  ).toEqual(["destination ready", "trace started"]);
  unmount();
});
