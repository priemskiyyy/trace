import { Trace, event } from "@priemskiyyy/trace";
import type { Destinations, TraceSchema } from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import type { MockAdapterOptions } from "@priemskiyyy/trace/mock";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createEffect, createSignal, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import { TraceProvider } from "src/context/TraceProvider";
import { spyOnTrace } from "src/primitives/spyOnTrace.fixture";
import { useConsent } from "src/primitives/useConsent";
import { useDestinationStatus } from "src/primitives/useDestinationStatus";
import { useTrace } from "src/primitives/useTrace";
import { useTraceStatus } from "src/primitives/useTraceStatus";
import type {
  RegisteredEvents,
  RegisteredPurpose,
  RegisteredTrace,
} from "src/types/Register";

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

const renderWith = (initial: RegisteredTrace, child: () => JSX.Element) => {
  const [trace, setTrace] = createSignal(initial);

  const view = render(() => (
    <TraceProvider trace={trace()}>{child()}</TraceProvider>
  ));

  return { view, setTrace };
};

const View = () => {
  const status = useTraceStatus();
  const destination = useDestinationStatus("product");
  const consent = useConsent();

  return (
    <span>{`${status().state}/${destination().state}/${consent().analytics}/${consent().advertising}`}</span>
  );
};

const createStarter = (trace: RegisteredTrace) => () => {
  onMount(() => {
    trace.start();
  });

  return null;
};

test.each<[string, () => unknown]>([
  ["useTrace", () => useTrace()],
  ["useTraceStatus", () => useTraceStatus()],
  ["useDestinationStatus", () => useDestinationStatus("product")],
  ["useConsent", () => useConsent()],
])(
  "%s outside a provider throws a TraceError that names the provider",
  (_name, usePrimitive) => {
    const Probe = () => {
      usePrimitive();

      return null;
    };

    expect(() => render(() => <Probe />)).toThrow(
      expect.objectContaining({
        name: "TraceError",
        code: "INVALID_CONFIGURATION",
        message: "Trace primitives must be used within a TraceProvider.",
      }),
    );
  },
);

test("useDestinationStatus throws the core's TraceError for a destination the Trace was not built with", () => {
  const { trace } = create();

  const Probe = () => {
    useDestinationStatus("missing");

    return null;
  };

  expect(() => renderWith(trace, () => <Probe />)).toThrow(
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
  const read = vi.fn();

  const Reader = () => {
    read(useTrace()());

    return null;
  };

  render(() => (
    <TraceProvider trace={outer.trace}>
      <TraceProvider trace={inner.trace}>
        <Reader />
      </TraceProvider>
    </TraceProvider>
  ));

  expect(read.mock.calls).toHaveLength(1);
  expect(read.mock.calls[0]?.[0]).toBe(inner.trace);
});

test("a replaced Trace moves every primitive to it and releases every listener on the previous one", () => {
  const first = create();
  const second = create();
  const firstSpy = spyOnTrace(first.trace);
  const secondSpy = spyOnTrace(second.trace);
  const read = vi.fn();

  second.trace.start();
  second.trace.consent.set({ analytics: "granted" });

  const Probe = () => {
    const trace = useTrace();
    const status = useTraceStatus();
    const destination = useDestinationStatus("product");
    const consent = useConsent();

    createEffect(() => {
      read(trace(), status(), destination(), consent());
    });

    return null;
  };

  const { setTrace } = renderWith(first.trace, () => <Probe />);

  setTrace(() => second.trace);

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

test("observing is passive: the provider and every primitive open nothing, track nothing and leave the Trace idle", () => {
  const { mock, trace } = create();
  const accepted = vi.fn();
  const timeline = vi.fn();
  const read = vi.fn();

  trace.events.subscribe(accepted);
  trace.diagnostics.events.subscribe(timeline);

  const Everything = () => {
    read(useTrace()());

    return <View />;
  };

  const { view } = renderWith(trace, () => <Everything />);

  expect(read.mock.calls).toHaveLength(1);
  expect(read.mock.calls[0]?.[0]).toBe(trace);
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

  trace.start();

  const Early = () => {
    const status = useTraceStatus();

    beforeMount.push(status().state);

    return <span>{status().state}</span>;
  };

  const { view } = renderWith(trace, () => <Early />);

  expect(beforeMount).toEqual(["idle"]);
  expect(view.container.textContent).toBe("started");
});

test("useTraceStatus moves to the Trace's own status once mounted, then updates once per change", () => {
  const { trace } = create();
  const updates = vi.fn();

  const Counted = () => {
    const status = useTraceStatus();

    createEffect(() => {
      updates(status());
    });

    return null;
  };

  renderWith(trace, () => <Counted />);

  expect(updates.mock.calls).toEqual([
    [{ state: "idle" }],
    [{ state: "idle" }],
  ]);
  expect(updates.mock.lastCall?.[0]).toBe(trace.status.get());

  trace.start();

  expect(updates.mock.calls.slice(2)).toEqual([[{ state: "started" }]]);

  trace.start();

  expect(updates.mock.calls.slice(2)).toEqual([[{ state: "started" }]]);

  trace.dispose();

  expect(updates.mock.calls.slice(2)).toEqual([
    [{ state: "started" }],
    [{ state: "disposed" }],
  ]);
});

test("useDestinationStatus follows one destination from idle to ready and to disposed, and to failed when it cannot open", () => {
  const { trace } = create();

  const Destination = () => {
    const status = useDestinationStatus("product");

    return <span>{status().state}</span>;
  };

  const { view } = renderWith(trace, () => <Destination />);

  expect(view.container.textContent).toBe("idle");

  trace.start();

  expect(view.container.textContent).toBe("ready");

  trace.dispose();

  expect(view.container.textContent).toBe("disposed");

  const failure = new Error("the SDK is not initialized");
  const read = vi.fn();

  const failing = create({
    onOpen: () => {
      throw failure;
    },
  });

  const Failing = () => {
    const status = useDestinationStatus("product");

    createEffect(() => {
      read(status());
    });

    return null;
  };

  renderWith(failing.trace, () => <Failing />);
  failing.trace.start();

  expect(read.mock.lastCall).toEqual([{ state: "failed", error: failure }]);
});

test("useConsent reads every purpose the consent option names and follows each decision", () => {
  const { trace } = create();
  const read = vi.fn();

  const Consent = () => {
    const consent = useConsent();

    createEffect(() => {
      read(consent());
    });

    return null;
  };

  renderWith(trace, () => <Consent />);

  expect(read.mock.lastCall).toEqual([
    { analytics: "unknown", advertising: "unknown" },
  ]);

  trace.consent.set({ analytics: "granted" });

  expect(read.mock.lastCall).toEqual([
    { analytics: "granted", advertising: "unknown" },
  ]);

  trace.consent.set({ analytics: "denied", advertising: "granted" });

  expect(read.mock.lastCall).toEqual([
    { analytics: "denied", advertising: "granted" },
  ]);
});

test("useConsent reads no purpose for a Trace without a consent option", () => {
  const trace = new Trace<
    RegisteredEvents,
    Destinations,
    TraceSchema,
    RegisteredPurpose
  >({ events, destinations: { product: createMockAdapter().adapter } });

  const read = vi.fn();

  const Consent = () => {
    const consent = useConsent();

    createEffect(() => {
      read(consent());
    });

    return null;
  };

  renderWith(trace, () => <Consent />);

  expect(read.mock.calls).toEqual([[{}], [{}]]);
  expect(read.mock.lastCall?.[0]).toBe(trace.consent.get());
});

test("a status callback is told about later changes only, with a listener of its own", () => {
  const { trace } = create();
  const spy = spyOnTrace(trace);
  const onChange = vi.fn();

  const Watcher = () => {
    useTraceStatus(onChange);

    return null;
  };

  renderWith(trace, () => <Watcher />);

  expect(onChange.mock.calls).toEqual([]);

  trace.start();

  expect(onChange.mock.calls).toEqual([[{ state: "started" }]]);
  expect(spy.calls).toEqual([
    ["status.subscribe"],
    ["status.subscribe"],
    ["start"],
  ]);
});

test("an update that keeps the Trace and the destination keeps every subscription the primitives made, releasing and repeating none", () => {
  const { trace } = create();
  const spy = spyOnTrace(trace);

  const [settings, setSettings] = createSignal({
    destination: "product",
    count: 0,
  });

  const Everything = (props: {
    settings: { destination: string; count: number };
  }) => {
    useTrace();
    useTraceStatus();
    useDestinationStatus(() => props.settings.destination);
    useConsent();

    return <span>{props.settings.count}</span>;
  };

  const { view } = renderWith(trace, () => (
    <Everything settings={settings()} />
  ));

  setSettings({ destination: "product", count: 1 });
  trace.start();

  expect(view.container.textContent).toBe("1");
  expect(spy.calls).toEqual([
    ["status.subscribe"],
    ["product.status.subscribe"],
    ["consent.subscribe"],
    ["start"],
  ]);
});

test("useDestinationStatus follows a name given as an accessor, moving its listener to the renamed destination", () => {
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
  const [name, setName] = createSignal("product");

  trace.start();

  const Named = () => {
    const status = useDestinationStatus(name);

    return <span>{status().state}</span>;
  };

  const { view } = renderWith(trace, () => <Named />);

  expect(view.container.textContent).toBe("ready");

  setName("research");

  expect(view.container.textContent).toBe("failed");
  expect(spy.live).toEqual({ "product.status": 0, "research.status": 1 });
});

test("the destination status and consent callbacks are told about later changes only", () => {
  const { trace } = create();
  const destination = vi.fn();
  const consent = vi.fn();

  trace.start();
  trace.consent.set({ advertising: "denied" });

  const Watcher = () => {
    useDestinationStatus("product", destination);
    useConsent(consent);

    return null;
  };

  renderWith(trace, () => <Watcher />);

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

  const { trace } = create({
    onOpen: () => {
      throw failure;
    },
  });

  const Starter = createStarter(trace);

  const Watcher = () => {
    const destination = useDestinationStatus("product", onFailed);

    return <span>{destination().state}</span>;
  };

  const { view } = renderWith(trace, () => (
    <>
      <Starter />
      <Watcher />
    </>
  ));

  expect(view.container.textContent).toBe("failed");
  expect(onFailed.mock.calls).toEqual([[{ state: "failed", error: failure }]]);
});

test("a callback that throws on a change made before its listener is contained as a listener's throw is", () => {
  const { trace } = create();
  const failure = new Error("the callback failed");
  const reported: (() => void)[] = [];

  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    reported.push(task);
  });

  const Starter = createStarter(trace);

  const Watcher = () => {
    const status = useTraceStatus(() => {
      throw failure;
    });

    return <span>{status().state}</span>;
  };

  const { view } = renderWith(trace, () => (
    <>
      <Starter />
      <Watcher />
    </>
  ));

  expect(view.container.textContent).toBe("started");
  expect(reported).toHaveLength(1);
  expect(() => reported[0]?.()).toThrow(failure);
});

test("a callback that throws cannot disturb the status, and its error reaches the host", () => {
  const { trace } = create();
  const failure = new Error("the callback failed");
  const reported: (() => void)[] = [];

  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    reported.push(task);
  });

  const Watcher = () => {
    const status = useTraceStatus(() => {
      throw failure;
    });

    return <span>{status().state}</span>;
  };

  const { view } = renderWith(trace, () => <Watcher />);

  trace.start();

  expect(view.container.textContent).toBe("started");
  expect(reported).toHaveLength(1);
  expect(() => reported[0]?.()).toThrow(failure);
});

test("a callback's rejected promise reaches the host rather than going unhandled", async () => {
  const { trace } = create();
  const failure = new Error("the callback failed");
  const reported: (() => void)[] = [];

  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    reported.push(task);
  });

  const Watcher = () => {
    useTraceStatus(() => Promise.reject(failure));

    return null;
  };

  renderWith(trace, () => <Watcher />);
  trace.start();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(reported).toHaveLength(1);
  expect(() => reported[0]?.()).toThrow(failure);
});

test("mounting and unmounting call nothing on the Trace but the subscriptions the primitives asked for", () => {
  const { mock, trace } = create();

  trace.start();

  const spy = spyOnTrace(trace);

  const Everything = () => {
    useTrace();
    useTraceStatus(vi.fn());
    useDestinationStatus("product");
    useConsent();

    return null;
  };

  const { view } = renderWith(trace, () => <Everything />);

  expect(spy.calls).toEqual([
    ["status.subscribe"],
    ["status.subscribe"],
    ["product.status.subscribe"],
    ["consent.subscribe"],
  ]);

  view.unmount();

  expect(spy.calls.slice(4)).toEqual([
    ["consent.release"],
    ["product.status.release"],
    ["status.release"],
    ["status.release"],
  ]);
  expect(trace.status.get()).toEqual({ state: "started" });
  expect(mock.sessions.map(({ disposeCount }) => disposeCount)).toEqual([0]);
});

test("unmounting leaves no listener behind, the callbacks' listeners included", () => {
  const { trace } = create();
  const spy = spyOnTrace(trace);

  const Watcher = () => {
    useTraceStatus(vi.fn());
    useDestinationStatus("product", vi.fn());
    useConsent(vi.fn());

    return null;
  };

  const { view } = renderWith(trace, () => <Watcher />);

  expect(spy.live).toEqual({ status: 2, "product.status": 2, consent: 2 });

  view.unmount();

  expect(spy.live).toEqual({ status: 0, "product.status": 0, consent: 0 });
});

test("a remount opens nothing, tracks nothing and never holds one primitive's listener twice", () => {
  const { mock, trace } = create();
  const spy = spyOnTrace(trace);
  const first = renderWith(trace, () => <View />);

  expect(spy.live).toEqual({ status: 1, "product.status": 1, consent: 1 });

  first.view.unmount();

  const second = renderWith(trace, () => <View />);

  expect(second.view.container.textContent).toBe("idle/idle/unknown/unknown");
  expect(spy.live).toEqual({ status: 1, "product.status": 1, consent: 1 });

  second.view.unmount();

  expect(spy.live).toEqual({ status: 0, "product.status": 0, consent: 0 });
  expect(mock.sessions).toEqual([]);
  expect(mock.tracks).toEqual([]);
});

test("release gate 14: rendering a component that calls useTrace dispatches no event", () => {
  const { mock, trace } = create();
  const accepted = vi.fn();

  trace.consent.set({ analytics: "granted", advertising: "granted" });
  trace.start();
  trace.events.subscribe(({ name }) => accepted(name));

  const OpenButton = () => {
    const trace = useTrace();

    const handleOpenClick = () => {
      trace().track("App Opened");
    };

    return <button onClick={handleOpenClick}>Open</button>;
  };

  renderWith(trace, () => <OpenButton />);

  expect(accepted.mock.calls).toEqual([]);
  expect(mock.tracks).toEqual([]);

  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  expect(accepted.mock.calls).toEqual([["App Opened"]]);
});
