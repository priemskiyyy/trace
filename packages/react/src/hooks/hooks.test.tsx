// @vitest-environment jsdom
import { Trace, event } from "@priemskiyyy/trace";
import type { Destinations, TraceSchema } from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import type { MockAdapterOptions } from "@priemskiyyy/trace/mock";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { StrictMode, useEffect, useLayoutEffect } from "react";
import type { PropsWithChildren } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { TraceProvider } from "src/context/TraceProvider";
import { spyOnTrace } from "src/hooks/spyOnTrace.fixture";
import { useConsent } from "src/hooks/useConsent";
import { useDestinationStatus } from "src/hooks/useDestinationStatus";
import { useTrace } from "src/hooks/useTrace";
import { useTraceStatus } from "src/hooks/useTraceStatus";
import type { RegisteredEvents, RegisteredPurpose } from "src/types/Register";

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

  const wrapper = ({ children }: PropsWithChildren) => (
    <TraceProvider trace={trace}>{children}</TraceProvider>
  );

  return { mock, trace, wrapper };
};

const useEveryHook = () => [
  useTrace(),
  useTraceStatus(),
  useDestinationStatus("product"),
  useConsent(),
];

const OpenButton = () => {
  const trace = useTrace();

  const handleOpenPress = () => {
    trace.track("App Opened");
  };

  return <button onClick={handleOpenPress}>Open</button>;
};

test.each<[string, () => unknown]>([
  ["useTrace", () => useTrace()],
  ["useTraceStatus", () => useTraceStatus()],
  ["useDestinationStatus", () => useDestinationStatus("product")],
  ["useConsent", () => useConsent()],
])(
  "%s outside a provider throws a TraceError that names the provider",
  (_name, useHook) => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(useHook)).toThrow(
      expect.objectContaining({
        name: "TraceError",
        code: "INVALID_CONFIGURATION",
        message: "Trace hooks must be used within a TraceProvider.",
      }),
    );
  },
);

test("useDestinationStatus throws the core's TraceError for a destination the Trace was not built with", () => {
  const { wrapper } = create();

  vi.spyOn(console, "error").mockImplementation(() => {});

  expect(() =>
    renderHook(() => useDestinationStatus("missing"), { wrapper }),
  ).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message:
        'Trace has no destination named "missing". The configured destinations are "product".',
    }),
  );
});

test("useTrace returns the nearest provider's Trace", () => {
  const outer = create();
  const inner = create();

  const wrapper = ({ children }: PropsWithChildren) => (
    <TraceProvider trace={outer.trace}>
      <TraceProvider trace={inner.trace}>{children}</TraceProvider>
    </TraceProvider>
  );

  expect(renderHook(() => useTrace(), { wrapper }).result.current).toBe(
    inner.trace,
  );
});

test("a replaced Trace moves every hook to it and releases every listener on the previous one", () => {
  const first = create();
  const second = create();
  const firstSpy = spyOnTrace(first.trace);
  const secondSpy = spyOnTrace(second.trace);
  const read = vi.fn();

  second.trace.start();
  second.trace.consent.set({ analytics: "granted" });

  const Probe = () => {
    read(...useEveryHook());

    return null;
  };

  const view = render(
    <TraceProvider trace={first.trace}>
      <Probe />
    </TraceProvider>,
  );

  view.rerender(
    <TraceProvider trace={second.trace}>
      <Probe />
    </TraceProvider>,
  );

  expect(read.mock.lastCall?.[0]).toBe(second.trace);
  expect(read.mock.lastCall?.slice(1)).toEqual([
    { state: "started" },
    { state: "ready" },
    { analytics: "granted", advertising: "unknown" },
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

test("observing is passive: the provider and every hook open nothing, track nothing and leave the Trace idle", () => {
  const { mock, trace, wrapper } = create();
  const accepted = vi.fn();
  const timeline = vi.fn();

  trace.events.subscribe(accepted);
  trace.diagnostics.events.subscribe(timeline);

  const { result } = renderHook(useEveryHook, { wrapper });

  expect(result.current[0]).toBe(trace);
  expect(result.current.slice(1)).toEqual([
    { state: "idle" },
    { state: "idle" },
    { analytics: "unknown", advertising: "unknown" },
  ]);
  expect(mock.sessions).toEqual([]);
  expect(mock.tracks).toEqual([]);
  expect(accepted.mock.calls).toEqual([]);
  expect(timeline.mock.calls).toEqual([]);
  expect(trace.status.get()).toEqual({ state: "idle" });
});

test("useTraceStatus follows the Trace and rerenders once per change", () => {
  const { trace, wrapper } = create();
  const renders = vi.fn();

  const { result } = renderHook(
    () => {
      renders();

      return useTraceStatus();
    },
    { wrapper },
  );

  expect(result.current).toEqual({ state: "idle" });

  act(() => trace.start());

  expect(result.current).toEqual({ state: "started" });
  expect(renders.mock.calls).toEqual([[], []]);

  act(() => trace.start());

  expect(renders.mock.calls).toEqual([[], []]);

  act(() => trace.dispose());

  expect(result.current).toEqual({ state: "disposed" });
  expect(renders.mock.calls).toEqual([[], [], []]);
});

test("useDestinationStatus follows one destination from idle to ready and to disposed, and to failed when it cannot open", () => {
  const { trace, wrapper } = create();

  const { result } = renderHook(() => useDestinationStatus("product"), {
    wrapper,
  });

  expect(result.current).toEqual({ state: "idle" });

  act(() => trace.start());

  expect(result.current).toEqual({ state: "ready" });

  act(() => trace.dispose());

  expect(result.current).toEqual({ state: "disposed" });

  const failure = new Error("the SDK is not initialized");

  const failing = create({
    onOpen: () => {
      throw failure;
    },
  });

  const failed = renderHook(() => useDestinationStatus("product"), {
    wrapper: failing.wrapper,
  });

  act(() => failing.trace.start());

  expect(failed.result.current).toEqual({ state: "failed", error: failure });
});

test("useConsent reads every purpose the consent option names and follows each decision", () => {
  const { trace, wrapper } = create();
  const { result } = renderHook(() => useConsent(), { wrapper });

  expect(result.current).toEqual({
    analytics: "unknown",
    advertising: "unknown",
  });

  act(() => trace.consent.set({ analytics: "granted" }));

  expect(result.current).toEqual({
    analytics: "granted",
    advertising: "unknown",
  });

  act(() => trace.consent.set({ analytics: "denied", advertising: "granted" }));

  expect(result.current).toEqual({
    analytics: "denied",
    advertising: "granted",
  });
});

test("useConsent reads no purpose for a Trace without a consent option", () => {
  const mock = createMockAdapter();

  const trace = new Trace<
    RegisteredEvents,
    Destinations,
    TraceSchema,
    RegisteredPurpose
  >({ events, destinations: { product: mock.adapter } });

  const wrapper = ({ children }: PropsWithChildren) => (
    <TraceProvider trace={trace}>{children}</TraceProvider>
  );

  expect(renderHook(() => useConsent(), { wrapper }).result.current).toEqual(
    {},
  );
});

test("a status callback is told about later changes only, with the latest callback and a listener of its own", () => {
  const { trace, wrapper } = create();
  const spy = spyOnTrace(trace);
  const first = vi.fn();
  const second = vi.fn();

  const { rerender } = renderHook(({ onChange }) => useTraceStatus(onChange), {
    wrapper,
    initialProps: { onChange: first },
  });

  rerender({ onChange: second });
  act(() => trace.start());

  expect(first.mock.calls).toEqual([]);
  expect(second.mock.calls).toEqual([[{ state: "started" }]]);
  expect(spy.calls).toEqual([
    ["status.subscribe"],
    ["status.subscribe"],
    ["start"],
  ]);
});

test("a rerender keeps every subscription the hooks made, releasing and repeating none", () => {
  const { trace, wrapper } = create();
  const spy = spyOnTrace(trace);
  const { rerender } = renderHook(useEveryHook, { wrapper });

  rerender();
  act(() => trace.start());

  expect(spy.calls).toEqual([
    ["status.subscribe"],
    ["product.status.subscribe"],
    ["consent.subscribe"],
    ["start"],
  ]);
});

test("useDestinationStatus moves its listener to a renamed destination", () => {
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

  const wrapper = ({ children }: PropsWithChildren) => (
    <TraceProvider trace={trace}>{children}</TraceProvider>
  );

  trace.start();

  const { result, rerender } = renderHook(
    ({ name }) => useDestinationStatus(name),
    { wrapper, initialProps: { name: "product" } },
  );

  expect(result.current).toEqual({ state: "ready" });

  rerender({ name: "research" });

  expect(result.current).toEqual({ state: "failed", error: failure });
  expect(spy.live).toEqual({ "product.status": 0, "research.status": 1 });
});

test("the destination status and consent callbacks are told about later changes only", () => {
  const { trace, wrapper } = create();
  const destination = vi.fn();
  const consent = vi.fn();

  trace.start();
  trace.consent.set({ advertising: "denied" });

  renderHook(
    () => [useDestinationStatus("product", destination), useConsent(consent)],
    { wrapper },
  );

  expect(destination.mock.calls).toEqual([]);
  expect(consent.mock.calls).toEqual([]);

  act(() => trace.consent.set({ analytics: "granted" }));
  act(() => trace.dispose());

  expect(destination.mock.calls).toEqual([[{ state: "disposed" }]]);
  expect(consent.mock.calls).toEqual([
    [{ analytics: "granted", advertising: "denied" }],
  ]);
});

test("a destination that fails to open in an earlier sibling's effect is told to the callback that mounts after it", () => {
  const failure = new Error("the SDK is not initialized");
  const onFailed = vi.fn();

  const { trace, wrapper } = create({
    onOpen: () => {
      throw failure;
    },
  });

  const Starter = () => {
    useEffect(() => {
      trace.start();
    }, []);

    return null;
  };

  const Watcher = () => {
    const destination = useDestinationStatus("product", onFailed);

    return <span>{destination.state}</span>;
  };

  const view = render(
    <>
      <Starter />
      <Watcher />
    </>,
    { wrapper },
  );

  expect(view.container.textContent).toBe("failed");
  expect(onFailed.mock.calls).toEqual([[{ state: "failed", error: failure }]]);
});

test("a callback that throws on a change made before its listener is contained as a listener's throw is", () => {
  const { trace, wrapper } = create();
  const failure = new Error("the callback failed");
  const reported: (() => void)[] = [];

  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    reported.push(task);
  });

  const { result } = renderHook(
    () => {
      const status = useTraceStatus(() => {
        throw failure;
      });

      useLayoutEffect(() => {
        trace.start();
      }, []);

      return status;
    },
    { wrapper },
  );

  expect(result.current).toEqual({ state: "started" });
  expect(reported).toHaveLength(1);
  expect(() => reported[0]?.()).toThrow(failure);
});

test("a callback that throws cannot disturb the snapshot, and its error reaches the host", () => {
  const { trace, wrapper } = create();
  const failure = new Error("the callback failed");
  const reported: (() => void)[] = [];

  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    reported.push(task);
  });

  const { result } = renderHook(
    () =>
      useTraceStatus(() => {
        throw failure;
      }),
    { wrapper },
  );

  act(() => trace.start());

  expect(result.current).toEqual({ state: "started" });
  expect(reported).toHaveLength(1);
  expect(() => reported[0]?.()).toThrow(failure);
});

test("a callback's rejected promise reaches the host rather than going unhandled", async () => {
  const { trace, wrapper } = create();
  const failure = new Error("the callback failed");
  const reported: (() => void)[] = [];

  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    reported.push(task);
  });

  renderHook(() => useTraceStatus(() => Promise.reject(failure)), {
    wrapper,
  });

  act(() => trace.start());
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(reported).toHaveLength(1);
  expect(() => reported[0]?.()).toThrow(failure);
});

test("mounting and unmounting call nothing on the Trace but the subscriptions the hooks asked for", () => {
  const { mock, trace, wrapper } = create();

  trace.start();

  const spy = spyOnTrace(trace);

  const view = renderHook(
    () => [
      useTrace(),
      useTraceStatus(vi.fn()),
      useDestinationStatus("product"),
      useConsent(),
    ],
    { wrapper },
  );

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
  const { trace, wrapper } = create();
  const spy = spyOnTrace(trace);

  const view = renderHook(
    () => [
      useTraceStatus(vi.fn()),
      useDestinationStatus("product", vi.fn()),
      useConsent(vi.fn()),
    ],
    { wrapper },
  );

  expect(spy.live).toEqual({ status: 2, "product.status": 2, consent: 2 });

  view.unmount();

  expect(spy.live).toEqual({ status: 0, "product.status": 0, consent: 0 });
});

test("Strict Mode and a remount open nothing, track nothing and never hold one hook's listener twice", () => {
  const { mock, trace } = create();
  const spy = spyOnTrace(trace);

  const View = () => {
    const status = useTraceStatus();
    const destination = useDestinationStatus("product");
    const consent = useConsent();

    return (
      <span>{`${status.state}/${destination.state}/${consent.analytics}`}</span>
    );
  };

  const tree = (
    <StrictMode>
      <TraceProvider trace={trace}>
        <View />
      </TraceProvider>
    </StrictMode>
  );

  const first = render(tree);

  expect(spy.live).toEqual({ status: 1, "product.status": 1, consent: 1 });

  first.unmount();

  const second = render(tree);

  expect(second.container.textContent).toBe("idle/idle/unknown");
  expect(spy.live).toEqual({ status: 1, "product.status": 1, consent: 1 });

  second.unmount();

  expect(spy.live).toEqual({ status: 0, "product.status": 0, consent: 0 });
  expect(mock.sessions).toEqual([]);
  expect(mock.tracks).toEqual([]);
});

test("release gate 14: rendering a component that calls useTrace dispatches no event", () => {
  const { mock, trace, wrapper } = create();
  const accepted = vi.fn();

  trace.consent.set({ analytics: "granted", advertising: "granted" });
  trace.start();
  trace.events.subscribe(({ name }) => accepted(name));

  render(
    <StrictMode>
      <OpenButton />
    </StrictMode>,
    { wrapper },
  );

  expect(accepted.mock.calls).toEqual([]);
  expect(mock.tracks).toEqual([]);

  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  expect(accepted.mock.calls).toEqual([["App Opened"]]);
});
