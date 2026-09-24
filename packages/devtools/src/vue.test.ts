import { TraceProvider } from "@priemskiyyy/trace-vue";
import type { RegisteredTrace } from "@priemskiyyy/trace-vue";
import { fireEvent, within } from "@testing-library/dom";
import { mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import { defineComponent, h, nextTick, shallowRef } from "vue";
import type { ShallowRef } from "vue";

import { createTrace } from "src/createTrace.fixture";
import { spyOnTrace } from "src/spyOnTrace.fixture";
import type { TraceDevtoolsProps } from "src/types/TraceDevtoolsProps";
import { TraceDevtools } from "src/vue";

afterEach(() => {
  localStorage.clear();
});

const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const Application = (
  trace: ShallowRef<RegisteredTrace>,
  props: ShallowRef<TraceDevtoolsProps>,
) =>
  defineComponent(
    () => () =>
      h(
        TraceProvider,
        { trace: trace.value },
        { default: () => h(TraceDevtools, props.value) },
      ),
  );

test("the Vue wrapper mounts the inspector for the provider's Trace, follows another and a new event limit, and removes it on unmount", async () => {
  const first = createTrace();
  const second = createTrace();
  const firstSpy = spyOnTrace(first.trace);
  const secondSpy = spyOnTrace(second.trace);
  const trace = shallowRef<RegisteredTrace>(first.trace);
  const props = shallowRef<TraceDevtoolsProps>({ initialIsOpen: true });
  const wrapper = mount(Application(trace, props));

  await nextTick();

  const host = wrapper.find("[data-trace-devtools]").element;
  const root = host.shadowRoot?.firstElementChild;

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

  trace.value = second.trace;
  props.value = { initialIsOpen: true, maxEvents: 1 };
  await nextTick();
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

  wrapper.unmount();

  expect(secondSpy.live).toEqual({
    diagnostics: 0,
    "diagnostics.events": 0,
    events: 0,
  });
  expect(host.shadowRoot?.childElementCount).toBe(0);
  expect(first.mock.sessions).toEqual([]);
});

test("without props the inspector starts closed and keeps more than one event", async () => {
  const { trace } = createTrace();
  const wrapper = mount(Application(shallowRef(trace), shallowRef({})));

  await nextTick();

  const root = wrapper.find("[data-trace-devtools]").element.shadowRoot
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
  wrapper.unmount();
});
