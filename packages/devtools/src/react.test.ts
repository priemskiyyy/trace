import { TraceProvider } from "@priemskiyyy/trace-react";
import type { RegisteredTrace } from "@priemskiyyy/trace-react";
import { fireEvent, within } from "@testing-library/dom";
import { cleanup, render } from "@testing-library/react";
import { StrictMode, createElement } from "react";
import { afterEach, expect, test } from "vitest";

import { createTrace } from "src/createTrace.fixture";
import { TraceDevtools } from "src/react";
import { spyOnTrace } from "src/spyOnTrace.fixture";
import type { TraceDevtoolsProps } from "src/types/TraceDevtoolsProps";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const tree = (
  trace: RegisteredTrace,
  props: TraceDevtoolsProps = { initialIsOpen: true },
) =>
  createElement(
    StrictMode,
    null,
    createElement(
      TraceProvider,
      { trace },
      createElement(TraceDevtools, props),
    ),
  );

const inspector = (container: HTMLElement) => {
  const root = container.querySelector("[data-trace-devtools]")?.shadowRoot
    ?.firstElementChild;

  if (!(root instanceof HTMLElement)) {
    throw new Error("Expected the devtools root inside the shadow root");
  }

  return within(root);
};

test("Strict Mode mounts one inspector, and unmounting leaves no listener behind", () => {
  const { mock, trace } = createTrace();
  const spy = spyOnTrace(trace);
  const view = render(tree(trace));

  expect(view.container.querySelectorAll("[data-trace-devtools]")).toHaveLength(
    1,
  );
  expect(
    inspector(view.container).getByRole("complementary", {
      name: "Trace devtools",
    }).tagName,
  ).toBe("ASIDE");
  expect(spy.live).toEqual({
    diagnostics: 1,
    "diagnostics.events": 1,
    events: 1,
  });

  view.unmount();

  expect(spy.live).toEqual({
    diagnostics: 0,
    "diagnostics.events": 0,
    events: 0,
  });
  expect(mock.sessions).toEqual([]);
  expect(mock.tracks).toEqual([]);
});

test("a rerender keeps the mounted inspector, follows a replaced Trace and a new event limit", async () => {
  const first = createTrace();
  const second = createTrace();
  const firstSpy = spyOnTrace(first.trace);
  const secondSpy = spyOnTrace(second.trace);
  const view = render(tree(first.trace));

  const search = () =>
    inspector(view.container).getByRole("searchbox", {
      name: "Filter events",
    });

  fireEvent.input(search(), { target: { value: "started" } });
  first.trace.start();
  await nextMacrotask();

  const types = () =>
    Array.from(
      inspector(view.container)
        .getByLabelText("Event timeline")
        .querySelectorAll(".event-type"),
      (type) => type.textContent,
    );

  expect(types()).toEqual(["trace started"]);

  view.rerender(tree(second.trace, { initialIsOpen: true, maxEvents: 1 }));
  second.trace.start();
  await nextMacrotask();

  expect(search()).toHaveProperty("value", "started");
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

  fireEvent.input(search(), { target: { value: "" } });

  expect(types()).toEqual(["destination ready"]);
  view.unmount();
});

test("without props the inspector starts closed and keeps more than one event", async () => {
  const { trace } = createTrace();
  const view = render(tree(trace, {}));
  const root = inspector(view.container);

  fireEvent.click(root.getByRole("button", { name: "Open Trace devtools" }));
  trace.start();
  await nextMacrotask();

  expect(
    Array.from(
      root.getByLabelText("Event timeline").querySelectorAll(".event-type"),
      (type) => type.textContent,
    ),
  ).toEqual(["destination ready", "trace started"]);
  view.unmount();
});
