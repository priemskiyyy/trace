import { Trace, event } from "@priemskiyyy/trace";
import type {
  ConsentDecision,
  Destinations,
  DestinationStatus,
  TraceSchema,
  TraceStatus,
} from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import { renderToString } from "solid-js/web";
import { expect, test, vi } from "vitest";

import { VIEW_MARKUP } from "src/context/serverMarkup.fixture";
import { TraceProvider } from "src/context/TraceProvider";
import { View } from "src/context/View.fixture";
import { spyOnTrace } from "src/primitives/spyOnTrace.fixture";
import { useConsent } from "src/primitives/useConsent";
import { useDestinationStatus } from "src/primitives/useDestinationStatus";
import { useTraceStatus } from "src/primitives/useTraceStatus";
import type { RegisteredEvents, RegisteredPurpose } from "src/types/Register";

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

test("a server render reads idle and unknown and subscribes nothing, callbacks included", () => {
  expect(typeof window).toBe("undefined");

  const { mock, trace } = create();
  const spy = spyOnTrace(trace);
  const onStatus = vi.fn();
  const onDestination = vi.fn();
  const onConsent = vi.fn();

  const html = renderToString(() => (
    <TraceProvider trace={trace}>
      <View
        onStatus={onStatus}
        onDestination={onDestination}
        onConsent={onConsent}
      />
    </TraceProvider>
  ));

  expect(html).toBe(VIEW_MARKUP);
  expect(spy.calls).toEqual([]);
  expect(mock.sessions).toEqual([]);
  expect(onStatus.mock.calls).toEqual([]);
  expect(onDestination.mock.calls).toEqual([]);
  expect(onConsent.mock.calls).toEqual([]);
});

test("the server snapshots are frozen and the idle statuses interned, whatever the Trace holds when the server renders", () => {
  const { trace } = create();

  const read =
    vi.fn<
      (
        status: TraceStatus,
        destination: DestinationStatus,
        consent: Record<string, ConsentDecision>,
      ) => void
    >();

  const Probe = () => {
    const status = useTraceStatus();
    const destination = useDestinationStatus("product");
    const consent = useConsent();

    read(status(), destination(), consent());

    return null;
  };

  const renderProbe = () =>
    renderToString(() => (
      <TraceProvider trace={trace}>
        <Probe />
      </TraceProvider>
    ));

  renderProbe();
  trace.start();
  trace.consent.set({ analytics: "granted", advertising: "denied" });
  renderProbe();

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
