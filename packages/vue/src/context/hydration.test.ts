import { Trace, event } from "@priemskiyyy/trace";
import type { Destinations, TraceSchema } from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import { afterEach, expect, test, vi } from "vitest";
import { createSSRApp, defineComponent, h, nextTick } from "vue";
import type { Component } from "vue";
import { renderToString } from "vue/server-renderer";

import { useConsent } from "src/composables/useConsent";
import { useDestinationStatus } from "src/composables/useDestinationStatus";
import { useTraceStatus } from "src/composables/useTraceStatus";
import { TraceProvider } from "src/context/TraceProvider";
import type {
  RegisteredEvents,
  RegisteredPurpose,
  RegisteredTrace,
} from "src/types/Register";

afterEach(() => {
  document.body.replaceChildren();
});

const create = () =>
  new Trace<RegisteredEvents, Destinations, TraceSchema, RegisteredPurpose>({
    events: { "App Opened": event() },
    destinations: { product: createMockAdapter().adapter },
    consent: { product: ["analytics", "advertising"] },
  });

const hydrate = async (trace: RegisteredTrace, child: Component) => {
  const createApp = () =>
    createSSRApp(() => h(TraceProvider, { trace }, () => h(child)));

  const html = await renderToString(createApp());

  trace.start();
  trace.consent.set({ analytics: "granted" });

  const container = document.body.appendChild(document.createElement("div"));

  container.innerHTML = html;

  const app = createApp();

  app.mount(container);
  await nextTick();

  return { app, container };
};

test("server markup hydrates without a mismatch, then shows the Trace the client started", async () => {
  const warn = vi.spyOn(console, "warn");
  const error = vi.spyOn(console, "error");
  const trace = create();

  const View = defineComponent(() => {
    const status = useTraceStatus();
    const destination = useDestinationStatus("product");
    const consent = useConsent();

    return () =>
      h(
        "span",
        `${status.value.state}/${destination.value.state}/${consent.value.analytics}/${consent.value.advertising}`,
      );
  });

  const { app, container } = await hydrate(trace, View);

  expect(warn.mock.calls).toEqual([]);
  expect(error.mock.calls).toEqual([]);
  expect(container.textContent).toBe("started/ready/granted/unknown");

  app.unmount();
});

test("hydrating over a Trace the client already started tells no callback, and a later change is told once", async () => {
  const warn = vi.spyOn(console, "warn");
  const trace = create();
  const onStatus = vi.fn();
  const onDestination = vi.fn();
  const onConsent = vi.fn();

  const Watcher = defineComponent(() => {
    const status = useTraceStatus(onStatus);
    const destination = useDestinationStatus("product", onDestination);
    const consent = useConsent(onConsent);

    return () =>
      h(
        "span",
        `${status.value.state}/${destination.value.state}/${consent.value.analytics}/${consent.value.advertising}`,
      );
  });

  const { app, container } = await hydrate(trace, Watcher);

  expect(container.textContent).toBe("started/ready/granted/unknown");
  expect(warn.mock.calls).toEqual([]);
  expect(onStatus.mock.calls).toEqual([]);
  expect(onDestination.mock.calls).toEqual([]);
  expect(onConsent.mock.calls).toEqual([]);

  trace.consent.set({ advertising: "denied" });

  expect(onConsent.mock.calls).toEqual([
    [{ analytics: "granted", advertising: "denied" }],
  ]);
  expect(onStatus.mock.calls).toEqual([]);
  expect(onDestination.mock.calls).toEqual([]);

  app.unmount();
});
