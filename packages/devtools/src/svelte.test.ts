import { fireEvent, within } from "@testing-library/dom";
import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, expect, test } from "vitest";

import { createTrace } from "src/createTrace.fixture";
import { spyOnTrace } from "src/spyOnTrace.fixture";
import Fixture from "src/svelte.fixture.svelte";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const inspector = (host: Element | null) => {
  const root = host?.shadowRoot?.firstElementChild;

  if (!(root instanceof HTMLElement)) {
    throw new Error("Expected the devtools root inside the shadow root");
  }

  return within(root);
};

test("the Svelte attachment mounts the inspector for the provider's Trace, mounts it again for another, and removes it on unmount", async () => {
  const first = createTrace();
  const second = createTrace();
  const firstSpy = spyOnTrace(first.trace);
  const secondSpy = spyOnTrace(second.trace);

  const view = render(Fixture, {
    trace: first.trace,
    options: { initialIsOpen: true },
  });

  await tick();

  const host = view.container.querySelector("div div");

  expect(
    inspector(host).getByRole("complementary", { name: "Trace devtools" })
      .tagName,
  ).toBe("ASIDE");
  expect(firstSpy.live).toEqual({
    diagnostics: 1,
    "diagnostics.events": 1,
    events: 1,
  });

  await view.rerender({ trace: second.trace });
  await tick();

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
    inspector(host).getByRole("complementary", { name: "Trace devtools" })
      .tagName,
  ).toBe("ASIDE");

  view.unmount();

  expect(secondSpy.live).toEqual({
    diagnostics: 0,
    "diagnostics.events": 0,
    events: 0,
  });
  expect(host?.shadowRoot?.childElementCount).toBe(0);
  expect(first.mock.sessions).toEqual([]);
});

test("without options the inspector starts closed and keeps more than one event", async () => {
  const { trace } = createTrace();
  const view = render(Fixture, { trace });

  await tick();

  const root = inspector(view.container.querySelector("div div"));

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
