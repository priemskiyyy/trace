import { Trace, event } from "@priemskiyyy/trace";
import type {
  ConsentDecision,
  Destinations,
  DestinationStatus,
  TraceSchema,
  TraceStatus,
} from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import { expect, test, vi } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import type { Component } from "vue";
import { renderToString } from "vue/server-renderer";

import { spyOnTrace } from "src/composables/spyOnTrace.fixture";
import { useConsent } from "src/composables/useConsent";
import { useDestinationStatus } from "src/composables/useDestinationStatus";
import { useTraceStatus } from "src/composables/useTraceStatus";
import { TraceProvider } from "src/context/TraceProvider";
import type {
  RegisteredEvents,
  RegisteredPurpose,
  RegisteredTrace,
} from "src/types/Register";

const create = () => {
  const mock = createMockAdapter();

  const trace = new Trace<
    RegisteredEvents,
    Destinations,
    TraceSchema,
    RegisteredPurpose
  >({
    events: { "App Opened": event() },
    destinations: { product: mock.adapter },
    consent: { product: ["analytics", "advertising"] },
  });

  return { mock, trace };
};

const renderOnServer = (trace: RegisteredTrace, child: Component) =>
  renderToString(
    createSSRApp(() => h(TraceProvider, { trace }, () => h(child))),
  );

test("a server render reads idle and unknown and subscribes nothing, callbacks included", async () => {
  expect(typeof window).toBe("undefined");

  const { mock, trace } = create();
  const spy = spyOnTrace(trace);
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

  expect(await renderOnServer(trace, Watcher)).toBe(
    "<!--[--><span>idle/idle/unknown/unknown</span><!--]-->",
  );
  expect(spy.calls).toEqual([]);
  expect(mock.sessions).toEqual([]);
  expect(onStatus.mock.calls).toEqual([]);
  expect(onDestination.mock.calls).toEqual([]);
  expect(onConsent.mock.calls).toEqual([]);
});

test("the server snapshots are frozen and the idle statuses interned, whatever the Trace holds when the server renders", async () => {
  const { trace } = create();

  const read =
    vi.fn<
      (
        status: TraceStatus,
        destination: DestinationStatus,
        consent: Record<string, ConsentDecision>,
      ) => void
    >();

  const Probe = defineComponent(() => {
    const status = useTraceStatus();
    const destination = useDestinationStatus("product");
    const consent = useConsent();

    return () => {
      read(status.value, destination.value, consent.value);

      return null;
    };
  });

  await renderOnServer(trace, Probe);
  trace.start();
  trace.consent.set({ analytics: "granted", advertising: "denied" });
  await renderOnServer(trace, Probe);

  const [first, second] = read.mock.calls;

  expect(read.mock.calls).toEqual([
    [
      { state: "idle" },
      { state: "idle" },
      { analytics: "unknown", advertising: "unknown" },
    ],
    [
      { state: "idle" },
      { state: "idle" },
      { analytics: "unknown", advertising: "unknown" },
    ],
  ]);
  expect(second?.[0]).toBe(first?.[0]);
  expect(second?.[1]).toBe(first?.[1]);
  expect(first?.map((snapshot) => Object.isFrozen(snapshot))).toEqual([
    true,
    true,
    true,
  ]);
});
