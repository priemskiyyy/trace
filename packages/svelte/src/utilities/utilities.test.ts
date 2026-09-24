import { Trace, event } from "@priemskiyyy/trace";
import type {
  ConsentDecision,
  Destinations,
  DestinationStatus,
  TraceSchema,
  TraceStatus,
} from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import type { MockAdapterOptions } from "@priemskiyyy/trace/mock";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, expect, test, vi } from "vitest";

import type { ReadableValue } from "../types/ReadableValue.js";
import type {
  RegisteredEvents,
  RegisteredPurpose,
  RegisteredTrace,
} from "../types/Register.js";
import Call from "./Call.fixture.svelte";
import CallHarness from "./CallHarness.fixture.svelte";
import NamedHarness from "./NamedHarness.fixture.svelte";
import NestedHarness from "./NestedHarness.fixture.svelte";
import OpenButtonHarness from "./OpenButtonHarness.fixture.svelte";
import { spyOnTrace } from "./spyOnTrace.fixture.js";
import StarterHarness from "./StarterHarness.fixture.svelte";
import { useConsent } from "./useConsent.js";
import { useDestinationStatus } from "./useDestinationStatus.js";
import { useTrace } from "./useTrace.js";
import { useTraceStatus } from "./useTraceStatus.js";
import ViewHarness from "./ViewHarness.fixture.svelte";

afterEach(cleanup);

const events: RegisteredEvents = { "App Opened": event() };

const create = (options: MockAdapterOptions = {}) => {
  const mock = createMockAdapter(options);

  const trace = new Trace<
    RegisteredEvents,
    Destinations,
    TraceSchema,
    RegisteredPurpose
  >({
    events,
    destinations: { product: mock.adapter },
    consent: { product: ["analytics", "advertising"] },
  });

  return { mock, trace };
};

type Everything = {
  trace: ReadableValue<RegisteredTrace>;
  status: ReadableValue<TraceStatus>;
  destination: ReadableValue<DestinationStatus>;
  consent: ReadableValue<Record<string, ConsentDecision>>;
};

const useEverything = (): Everything => ({
  trace: useTrace(),
  status: useTraceStatus(),
  destination: useDestinationStatus("product"),
  consent: useConsent(),
});

const readCurrent = ({ status, destination, consent }: Everything) => [
  status.current,
  destination.current,
  consent.current,
];

// Svelte schedules its own work with queueMicrotask, so every task still runs and what one throws is kept.
const collectRethrown = () => {
  const queue = queueMicrotask.bind(globalThis);
  const rethrown: unknown[] = [];

  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    queue(() => {
      try {
        task();
      } catch (error) {
        rethrown.push(error);
      }
    });
  });

  return rethrown;
};

test.each<[string, () => unknown]>([
  ["useTrace", () => useTrace()],
  ["useTraceStatus", () => useTraceStatus()],
  ["useDestinationStatus", () => useDestinationStatus("product")],
  ["useConsent", () => useConsent()],
])(
  "%s outside a provider throws a TraceError that names the provider",
  (_name, use) => {
    expect(() => render(Call, { use })).toThrow(
      expect.objectContaining({
        name: "TraceError",
        code: "INVALID_CONFIGURATION",
        // Svelte appends the component stack to the message in development.
        message: expect.stringMatching(
          /^Trace utilities must be used within a TraceProvider\.\n\n\tin /,
        ),
      }),
    );
  },
);

test("useDestinationStatus throws the core's TraceError for a destination the Trace was not built with", () => {
  const { trace } = create();

  expect(() =>
    render(CallHarness, {
      trace,
      use: () => useDestinationStatus("missing"),
    }),
  ).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message: expect.stringMatching(
        /^Trace has no destination named "missing"\. The configured destinations are "product"\.\n\n\tin /,
      ),
    }),
  );
});

test("useTrace returns the nearest provider's Trace", () => {
  const outer = create();
  const inner = create();
  const traces: ReadableValue<RegisteredTrace>[] = [];

  render(NestedHarness, {
    outer: outer.trace,
    inner: inner.trace,
    use: () => traces.push(useTrace()),
  });

  expect(traces).toHaveLength(1);
  expect(traces[0]?.current).toBe(inner.trace);
});

test("a replaced Trace moves every utility to it and releases every listener on the previous one", async () => {
  const first = create();
  const second = create();
  const firstSpy = spyOnTrace(first.trace);
  const secondSpy = spyOnTrace(second.trace);
  const observed: Everything[] = [];

  second.trace.start();
  second.trace.consent.set({ analytics: "granted" });

  const view = render(CallHarness, {
    trace: first.trace,
    use: () => observed.push(useEverything()),
  });

  await view.rerender({ trace: second.trace });

  expect(observed[0]?.trace.current).toBe(second.trace);
  expect(observed.map(readCurrent)).toEqual([
    [
      { state: "started" },
      { state: "ready" },
      { analytics: "granted", advertising: "unknown" },
    ],
  ]);
  expect(firstSpy.live).toEqual({
    status: 0,
    "product.status": 0,
    consent: 0,
  });
  expect(secondSpy.live).toEqual({
    status: 1,
    "product.status": 1,
    consent: 1,
  });
});

test("observing is passive: the provider and every utility open nothing, track nothing and leave the Trace idle", () => {
  const { mock, trace } = create();
  const accepted = vi.fn();
  const timeline = vi.fn();
  const observed: Everything[] = [];

  trace.events.subscribe(accepted);
  trace.diagnostics.events.subscribe(timeline);

  render(CallHarness, { trace, use: () => observed.push(useEverything()) });

  const view = render(ViewHarness, { trace });

  expect(observed[0]?.trace.current).toBe(trace);
  expect(observed.map(readCurrent)).toEqual([
    [
      { state: "idle" },
      { state: "idle" },
      { analytics: "unknown", advertising: "unknown" },
    ],
  ]);
  expect(view.container.textContent).toBe("idle/idle/unknown/unknown");
  expect(mock.sessions).toEqual([]);
  expect(mock.tracks).toEqual([]);
  expect(accepted.mock.calls).toEqual([]);
  expect(timeline.mock.calls).toEqual([]);
  expect(trace.status.get()).toEqual({ state: "idle" });
});

test("before it is mounted a status reads idle, even for a Trace that already started", () => {
  const { trace } = create();
  const beforeMount: string[] = [];
  const statuses: ReadableValue<TraceStatus>[] = [];

  trace.start();

  render(CallHarness, {
    trace,
    use: () => {
      const status = useTraceStatus();

      beforeMount.push(status.current.state);
      statuses.push(status);
    },
  });

  expect(beforeMount).toEqual(["idle"]);
  expect(statuses[0]?.current).toEqual({ state: "started" });
});

test("useTraceStatus reads the Trace's own status once mounted, then updates once per change", () => {
  const { trace } = create();
  const updates = vi.fn();
  const statuses: ReadableValue<TraceStatus>[] = [];

  render(CallHarness, {
    trace,
    use: () => statuses.push(useTraceStatus()),
    watch: () => updates(statuses[0]?.current),
  });

  expect(updates.mock.calls).toEqual([[{ state: "idle" }]]);
  expect(updates.mock.lastCall?.[0]).toBe(trace.status.get());

  trace.start();
  flushSync();

  expect(updates.mock.calls.slice(1)).toEqual([[{ state: "started" }]]);

  trace.start();
  flushSync();

  expect(updates.mock.calls.slice(1)).toEqual([[{ state: "started" }]]);

  trace.dispose();
  flushSync();

  expect(updates.mock.calls.slice(1)).toEqual([
    [{ state: "started" }],
    [{ state: "disposed" }],
  ]);
});

test("useDestinationStatus follows one destination from idle to ready and to disposed, and to failed when it cannot open", () => {
  const { trace } = create();
  const destinations: ReadableValue<DestinationStatus>[] = [];

  render(CallHarness, {
    trace,
    use: () => destinations.push(useDestinationStatus("product")),
  });

  expect(destinations[0]?.current).toEqual({ state: "idle" });

  trace.start();

  expect(destinations[0]?.current).toEqual({ state: "ready" });

  trace.dispose();

  expect(destinations[0]?.current).toEqual({ state: "disposed" });

  const failure = new Error("the SDK is not initialized");

  const failing = create({
    onOpen: () => {
      throw failure;
    },
  });

  render(CallHarness, {
    trace: failing.trace,
    use: () => destinations.push(useDestinationStatus("product")),
  });

  failing.trace.start();

  expect(destinations[1]?.current).toEqual({ state: "failed", error: failure });
});

test("useConsent reads every purpose the consent option names and follows each decision", () => {
  const { trace } = create();
  const decisions: ReadableValue<Record<string, ConsentDecision>>[] = [];

  render(CallHarness, { trace, use: () => decisions.push(useConsent()) });

  expect(decisions[0]?.current).toEqual({
    analytics: "unknown",
    advertising: "unknown",
  });

  trace.consent.set({ analytics: "granted" });

  expect(decisions[0]?.current).toEqual({
    analytics: "granted",
    advertising: "unknown",
  });

  trace.consent.set({ analytics: "denied", advertising: "granted" });

  expect(decisions[0]?.current).toEqual({
    analytics: "denied",
    advertising: "granted",
  });
});

test("useConsent reads no purpose for a Trace without a consent option", () => {
  const trace = new Trace<
    RegisteredEvents,
    Destinations,
    TraceSchema,
    RegisteredPurpose
  >({ events, destinations: { product: createMockAdapter().adapter } });

  const beforeMount: Record<string, ConsentDecision>[] = [];
  const decisions: ReadableValue<Record<string, ConsentDecision>>[] = [];

  render(CallHarness, {
    trace,
    use: () => {
      const consent = useConsent();

      beforeMount.push(consent.current);
      decisions.push(consent);
    },
  });

  expect(beforeMount).toEqual([{}]);
  expect(decisions[0]?.current).toBe(trace.consent.get());
});

test("a status callback is told about later changes only, with a listener of its own", () => {
  const { trace } = create();
  const spy = spyOnTrace(trace);
  const onChange = vi.fn();

  render(CallHarness, { trace, use: () => useTraceStatus(onChange) });

  expect(onChange.mock.calls).toEqual([]);

  trace.start();

  expect(onChange.mock.calls).toEqual([[{ state: "started" }]]);
  expect(spy.calls).toEqual([
    ["status.subscribe"],
    ["status.subscribe"],
    ["start"],
  ]);
});

test("a rerender keeps every subscription the utilities made, releasing and repeating none", async () => {
  const { trace } = create();
  const spy = spyOnTrace(trace);

  const view = render(NamedHarness, { trace, name: "product", count: 0 });

  await view.rerender({ count: 1 });
  trace.start();
  flushSync();

  expect(view.container.textContent).toBe("ready/1");
  expect(spy.calls).toEqual([
    ["status.subscribe"],
    ["product.status.subscribe"],
    ["consent.subscribe"],
    ["start"],
  ]);
});

test("useDestinationStatus follows a name given as a getter, moving its listener to the renamed destination", async () => {
  const failure = new Error("the SDK is not initialized");

  const trace = new Trace<
    RegisteredEvents,
    Destinations,
    TraceSchema,
    RegisteredPurpose
  >({
    events,
    destinations: {
      product: createMockAdapter().adapter,
      research: createMockAdapter({
        onOpen: () => {
          throw failure;
        },
      }).adapter,
    },
  });

  const spy = spyOnTrace(trace);

  trace.start();

  const view = render(NamedHarness, { trace, name: "product", count: 0 });

  expect(view.container.textContent).toBe("ready/0");

  await view.rerender({ name: "research" });

  expect(view.container.textContent).toBe("failed/0");
  expect(spy.live).toEqual({
    status: 1,
    "product.status": 0,
    "research.status": 1,
    consent: 1,
  });
});

test("the destination status and consent callbacks are told about later changes only", () => {
  const { trace } = create();
  const destination = vi.fn();
  const consent = vi.fn();

  trace.start();
  trace.consent.set({ advertising: "denied" });

  render(CallHarness, {
    trace,
    use: () => {
      useDestinationStatus("product", destination);
      useConsent(consent);
    },
  });

  expect(destination.mock.calls).toEqual([]);
  expect(consent.mock.calls).toEqual([]);

  trace.consent.set({ analytics: "granted" });
  trace.dispose();

  expect(destination.mock.calls).toEqual([[{ state: "disposed" }]]);
  expect(consent.mock.calls).toEqual([
    [{ analytics: "granted", advertising: "denied" }],
  ]);
});

test("a destination that fails to open in an earlier sibling's onMount is told to the callback that mounts after it", () => {
  const failure = new Error("the SDK is not initialized");
  const onFailed = vi.fn();
  const destinations: ReadableValue<DestinationStatus>[] = [];

  const { trace } = create({
    onOpen: () => {
      throw failure;
    },
  });

  render(StarterHarness, {
    trace,
    use: () => destinations.push(useDestinationStatus("product", onFailed)),
  });

  expect(destinations[0]?.current).toEqual({ state: "failed", error: failure });
  expect(onFailed.mock.calls).toEqual([[{ state: "failed", error: failure }]]);
});

test("a callback that throws on a change made before its listener is contained as a listener's throw is", async () => {
  const { trace } = create();
  const failure = new Error("the callback failed");
  const rethrown = collectRethrown();
  const statuses: ReadableValue<TraceStatus>[] = [];

  render(StarterHarness, {
    trace,
    use: () =>
      statuses.push(
        useTraceStatus(() => {
          throw failure;
        }),
      ),
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(statuses[0]?.current).toEqual({ state: "started" });
  expect(rethrown).toHaveLength(1);
  expect(rethrown[0]).toBe(failure);
});

test("a callback that throws cannot disturb the status, and its error reaches the host", async () => {
  const { trace } = create();
  const failure = new Error("the callback failed");
  const rethrown = collectRethrown();
  const statuses: ReadableValue<TraceStatus>[] = [];

  render(CallHarness, {
    trace,
    use: () =>
      statuses.push(
        useTraceStatus(() => {
          throw failure;
        }),
      ),
  });

  trace.start();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(statuses[0]?.current).toEqual({ state: "started" });
  expect(rethrown).toHaveLength(1);
  expect(rethrown[0]).toBe(failure);
});

test("a callback's rejected promise reaches the host rather than going unhandled", async () => {
  const { trace } = create();
  const failure = new Error("the callback failed");
  const rethrown = collectRethrown();

  render(CallHarness, {
    trace,
    use: () => useTraceStatus(() => Promise.reject(failure)),
  });

  trace.start();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(rethrown).toHaveLength(1);
  expect(rethrown[0]).toBe(failure);
});

test("mounting and unmounting call nothing on the Trace but the subscriptions the utilities asked for", () => {
  const { mock, trace } = create();

  trace.start();

  const spy = spyOnTrace(trace);

  const view = render(CallHarness, {
    trace,
    use: () => {
      useTrace();
      useTraceStatus(vi.fn());
      useDestinationStatus("product");
      useConsent();
    },
  });

  expect(spy.calls).toEqual([
    ["status.subscribe"],
    ["status.subscribe"],
    ["product.status.subscribe"],
    ["consent.subscribe"],
  ]);

  view.unmount();

  expect(spy.calls.slice(4)).toEqual([
    ["status.release"],
    ["status.release"],
    ["product.status.release"],
    ["consent.release"],
  ]);
  expect(trace.status.get()).toEqual({ state: "started" });
  expect(mock.sessions.map(({ disposeCount }) => disposeCount)).toEqual([0]);
});

test("unmounting leaves no listener behind, the callbacks' listeners included", () => {
  const { trace } = create();
  const spy = spyOnTrace(trace);

  const view = render(CallHarness, {
    trace,
    use: () => {
      useTraceStatus(vi.fn());
      useDestinationStatus("product", vi.fn());
      useConsent(vi.fn());
    },
  });

  expect(spy.live).toEqual({ status: 2, "product.status": 2, consent: 2 });

  view.unmount();

  expect(spy.live).toEqual({ status: 0, "product.status": 0, consent: 0 });
});

test("a remount opens nothing, tracks nothing and never holds one utility's listener twice", () => {
  const { mock, trace } = create();
  const spy = spyOnTrace(trace);
  const first = render(ViewHarness, { trace });

  expect(spy.live).toEqual({ status: 1, "product.status": 1, consent: 1 });

  first.unmount();

  const second = render(ViewHarness, { trace });

  expect(second.container.textContent).toBe("idle/idle/unknown/unknown");
  expect(spy.live).toEqual({ status: 1, "product.status": 1, consent: 1 });

  second.unmount();

  expect(spy.live).toEqual({ status: 0, "product.status": 0, consent: 0 });
  expect(mock.sessions).toEqual([]);
  expect(mock.tracks).toEqual([]);
});

test("release gate 14: rendering a component that calls useTrace dispatches no event", async () => {
  const { mock, trace } = create();
  const accepted = vi.fn();

  trace.consent.set({ analytics: "granted", advertising: "granted" });
  trace.start();
  trace.events.subscribe(({ name }) => accepted(name));

  render(OpenButtonHarness, { trace });

  expect(accepted.mock.calls).toEqual([]);
  expect(mock.tracks).toEqual([]);

  await fireEvent.click(screen.getByRole("button", { name: "Open" }));

  expect(accepted.mock.calls).toEqual([["App Opened"]]);
});
