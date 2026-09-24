import { Trace, event } from "@priemskiyyy/trace";
import type { Destinations, TraceSchema } from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import type { MockAdapterOptions } from "@priemskiyyy/trace/mock";
import { mount } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick, onMounted, shallowRef } from "vue";
import type { Component } from "vue";

import { spyOnTrace } from "src/composables/spyOnTrace.fixture";
import { useConsent } from "src/composables/useConsent";
import { useDestinationStatus } from "src/composables/useDestinationStatus";
import { useTrace } from "src/composables/useTrace";
import { useTraceStatus } from "src/composables/useTraceStatus";
import { TraceProvider } from "src/context/TraceProvider";
import type {
  RegisteredEvents,
  RegisteredPurpose,
  RegisteredTrace,
} from "src/types/Register";

const views = new Set<{ unmount: () => void }>();

afterEach(() => {
  for (const view of views) {
    view.unmount();
  }

  views.clear();
});

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

const render = (trace: RegisteredTrace, child: Component) => {
  const current = shallowRef(trace);

  const view = mount(
    defineComponent(
      () => () =>
        h(TraceProvider, { trace: current.value }, { default: () => h(child) }),
    ),
  );

  views.add(view);

  return { view, current };
};

const unmount = (view: { unmount: () => void }) => {
  views.delete(view);
  view.unmount();
};

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

const createStarter = (trace: RegisteredTrace) =>
  defineComponent(() => {
    onMounted(() => {
      trace.start();
    });

    return () => null;
  });

test.each<[string, () => unknown]>([
  ["useTrace", () => useTrace()],
  ["useTraceStatus", () => useTraceStatus()],
  ["useDestinationStatus", () => useDestinationStatus("product")],
  ["useConsent", () => useConsent()],
])(
  "%s outside a provider throws a TraceError that names the provider",
  (_name, useComposable) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() =>
      mount(
        defineComponent(() => {
          useComposable();

          return () => null;
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        name: "TraceError",
        code: "INVALID_CONFIGURATION",
        message: "Trace composables must be used within a TraceProvider.",
      }),
    );
  },
);

test("useDestinationStatus throws the core's TraceError for a destination the Trace was not built with", () => {
  const { trace } = create();

  vi.spyOn(console, "warn").mockImplementation(() => {});

  expect(() =>
    render(
      trace,
      defineComponent(() => {
        useDestinationStatus("missing");

        return () => null;
      }),
    ),
  ).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message:
        'Trace has no destination named "missing". The configured destinations are "product".',
    }),
  );
});

test("a provider given no Trace is reported as missing its required prop", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  const view = mount(
    defineComponent(() => () => h(TraceProvider, null, () => "content")),
  );

  views.add(view);

  expect(view.text()).toBe("content");
  expect(warn.mock.calls.map(([message]) => message)).toEqual([
    '[Vue warn]: Missing required prop: "trace"',
  ]);
});

test("useTrace returns the nearest provider's Trace", () => {
  const outer = create();
  const inner = create();
  const read = vi.fn();

  const Reader = defineComponent(() => {
    const trace = useTrace();

    return () => {
      read(trace.value);

      return null;
    };
  });

  const view = mount(
    defineComponent(
      () => () =>
        h(TraceProvider, { trace: outer.trace }, () =>
          h(TraceProvider, { trace: inner.trace }, () => h(Reader)),
        ),
    ),
  );

  views.add(view);

  expect(read.mock.calls).toHaveLength(1);
  expect(read.mock.calls[0]?.[0]).toBe(inner.trace);
});

test("a replaced Trace moves every composable to it and releases every listener on the previous one", async () => {
  const first = create();
  const second = create();
  const firstSpy = spyOnTrace(first.trace);
  const secondSpy = spyOnTrace(second.trace);
  const read = vi.fn();

  second.trace.start();
  second.trace.consent.set({ analytics: "granted" });

  const Probe = defineComponent(() => {
    const trace = useTrace();
    const status = useTraceStatus();
    const destination = useDestinationStatus("product");
    const consent = useConsent();

    return () => {
      read(trace.value, status.value, destination.value, consent.value);

      return null;
    };
  });

  const { current } = render(first.trace, Probe);

  current.value = second.trace;
  await nextTick();

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

test("observing is passive: the provider and every composable open nothing, track nothing and leave the Trace idle", async () => {
  const { mock, trace } = create();
  const accepted = vi.fn();
  const timeline = vi.fn();
  const read = vi.fn();

  trace.events.subscribe(accepted);
  trace.diagnostics.events.subscribe(timeline);

  const Everything = defineComponent(() => {
    read(useTrace().value);

    return () => h(View);
  });

  const { view } = render(trace, Everything);

  await nextTick();

  expect(read.mock.calls).toHaveLength(1);
  expect(read.mock.calls[0]?.[0]).toBe(trace);
  expect(view.text()).toBe("idle/idle/unknown/unknown");
  expect(mock.sessions).toEqual([]);
  expect(mock.tracks).toEqual([]);
  expect(accepted.mock.calls).toEqual([]);
  expect(timeline.mock.calls).toEqual([]);
  expect(trace.status.get()).toEqual({ state: "idle" });
});

test("before it is mounted a status reads idle, even for a Trace that already started", async () => {
  const { trace } = create();
  const beforeMount: string[] = [];

  trace.start();

  const Early = defineComponent(() => {
    const status = useTraceStatus();

    beforeMount.push(status.value.state);

    return () => h("span", status.value.state);
  });

  const { view } = render(trace, Early);

  await nextTick();

  expect(beforeMount).toEqual(["idle"]);
  expect(view.text()).toBe("started");
});

test("useTraceStatus moves to the Trace's own status once mounted, then renders once per change", async () => {
  const { trace } = create();
  const renders = vi.fn();

  const Counted = defineComponent(() => {
    const status = useTraceStatus();

    return () => {
      renders(status.value);

      return h("span", status.value.state);
    };
  });

  render(trace, Counted);
  await nextTick();

  expect(renders.mock.calls).toEqual([
    [{ state: "idle" }],
    [{ state: "idle" }],
  ]);
  expect(renders.mock.lastCall?.[0]).toBe(trace.status.get());

  trace.start();
  await nextTick();

  expect(renders.mock.calls.slice(2)).toEqual([[{ state: "started" }]]);

  trace.start();
  await nextTick();

  expect(renders.mock.calls.slice(2)).toEqual([[{ state: "started" }]]);

  trace.dispose();
  await nextTick();

  expect(renders.mock.calls.slice(2)).toEqual([
    [{ state: "started" }],
    [{ state: "disposed" }],
  ]);
});

test("useDestinationStatus follows one destination from idle to ready and to disposed, and to failed when it cannot open", async () => {
  const { trace } = create();

  const Destination = defineComponent(() => {
    const status = useDestinationStatus("product");

    return () => h("span", status.value.state);
  });

  const { view } = render(trace, Destination);

  expect(view.text()).toBe("idle");

  trace.start();
  await nextTick();

  expect(view.text()).toBe("ready");

  trace.dispose();
  await nextTick();

  expect(view.text()).toBe("disposed");

  const failure = new Error("the SDK is not initialized");
  const read = vi.fn();

  const failing = create({
    onOpen: () => {
      throw failure;
    },
  });

  render(
    failing.trace,
    defineComponent(() => {
      const status = useDestinationStatus("product");

      return () => {
        read(status.value);

        return null;
      };
    }),
  );

  failing.trace.start();
  await nextTick();

  expect(read.mock.lastCall).toEqual([{ state: "failed", error: failure }]);
});

test("useConsent reads every purpose the consent option names and follows each decision", async () => {
  const { trace } = create();
  const read = vi.fn();

  render(
    trace,
    defineComponent(() => {
      const consent = useConsent();

      return () => {
        read(consent.value);

        return null;
      };
    }),
  );

  expect(read.mock.lastCall).toEqual([
    { analytics: "unknown", advertising: "unknown" },
  ]);

  trace.consent.set({ analytics: "granted" });
  await nextTick();

  expect(read.mock.lastCall).toEqual([
    { analytics: "granted", advertising: "unknown" },
  ]);

  trace.consent.set({ analytics: "denied", advertising: "granted" });
  await nextTick();

  expect(read.mock.lastCall).toEqual([
    { analytics: "denied", advertising: "granted" },
  ]);
});

test("useConsent reads no purpose for a Trace without a consent option", async () => {
  const trace = new Trace<
    RegisteredEvents,
    Destinations,
    TraceSchema,
    RegisteredPurpose
  >({ events, destinations: { product: createMockAdapter().adapter } });

  const read = vi.fn();

  render(
    trace,
    defineComponent(() => {
      const consent = useConsent();

      return () => {
        read(consent.value);

        return null;
      };
    }),
  );

  await nextTick();

  expect(read.mock.calls).toEqual([[{}], [{}]]);
  expect(read.mock.lastCall?.[0]).toBe(trace.consent.get());
});

test("a status callback is told about later changes only, with a listener of its own", () => {
  const { trace } = create();
  const spy = spyOnTrace(trace);
  const onChange = vi.fn();

  render(
    trace,
    defineComponent(() => {
      useTraceStatus(onChange);

      return () => null;
    }),
  );

  expect(onChange.mock.calls).toEqual([]);

  trace.start();

  expect(onChange.mock.calls).toEqual([[{ state: "started" }]]);
  expect(spy.calls).toEqual([
    ["status.subscribe"],
    ["status.subscribe"],
    ["start"],
  ]);
});

test("a rerender keeps every subscription the composables made, releasing and repeating none", async () => {
  const { trace } = create();
  const spy = spyOnTrace(trace);
  const count = shallowRef(0);

  const Everything = defineComponent(
    (props: { settings: { destination: string; count: number } }) => {
      useTrace();
      useTraceStatus();
      useDestinationStatus(() => props.settings.destination);
      useConsent();

      return () => h("span", String(props.settings.count));
    },
    { props: { settings: { type: Object, required: true } } },
  );

  const view = mount(
    defineComponent(
      () => () =>
        h(TraceProvider, { trace }, () =>
          h(Everything, {
            settings: { destination: "product", count: count.value },
          }),
        ),
    ),
  );

  views.add(view);

  count.value = 1;
  await nextTick();
  trace.start();

  expect(view.text()).toBe("1");
  expect(spy.calls).toEqual([
    ["status.subscribe"],
    ["product.status.subscribe"],
    ["consent.subscribe"],
    ["start"],
  ]);
});

test("useDestinationStatus follows a name given as a ref or a getter, moving its listener to the renamed destination", async () => {
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
  const name = shallowRef("product");

  trace.start();

  const Named = defineComponent(() => {
    const byRef = useDestinationStatus(name);
    const byGetter = useDestinationStatus(() => name.value);

    return () => h("span", `${byRef.value.state}/${byGetter.value.state}`);
  });

  const { view } = render(trace, Named);

  await nextTick();

  expect(view.text()).toBe("ready/ready");

  name.value = "research";
  await nextTick();

  expect(view.text()).toBe("failed/failed");
  expect(spy.live).toEqual({ "product.status": 0, "research.status": 2 });
});

test("the destination status and consent callbacks are told about later changes only", () => {
  const { trace } = create();
  const destination = vi.fn();
  const consent = vi.fn();

  trace.start();
  trace.consent.set({ advertising: "denied" });

  render(
    trace,
    defineComponent(() => {
      useDestinationStatus("product", destination);
      useConsent(consent);

      return () => null;
    }),
  );

  expect(destination.mock.calls).toEqual([]);
  expect(consent.mock.calls).toEqual([]);

  trace.consent.set({ analytics: "granted" });
  trace.dispose();

  expect(destination.mock.calls).toEqual([[{ state: "disposed" }]]);
  expect(consent.mock.calls).toEqual([
    [{ analytics: "granted", advertising: "denied" }],
  ]);
});

test("a destination that fails to open in an earlier sibling's mounted hook is told to the callback that mounts after it", async () => {
  const failure = new Error("the SDK is not initialized");
  const onFailed = vi.fn();

  const { trace } = create({
    onOpen: () => {
      throw failure;
    },
  });

  const Watcher = defineComponent(() => {
    const destination = useDestinationStatus("product", onFailed);

    return () => h("span", destination.value.state);
  });

  const view = mount(
    defineComponent(
      () => () =>
        h(TraceProvider, { trace }, () => [
          h(createStarter(trace)),
          h(Watcher),
        ]),
    ),
  );

  views.add(view);
  await nextTick();

  expect(view.text()).toBe("failed");
  expect(onFailed.mock.calls).toEqual([[{ state: "failed", error: failure }]]);
});

test("a callback that throws on a change made before its listener is contained as a listener's throw is", async () => {
  const { trace } = create();
  const failure = new Error("the callback failed");
  const reported: (() => void)[] = [];

  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    reported.push(task);
  });

  const Watcher = defineComponent(() => {
    const status = useTraceStatus(() => {
      throw failure;
    });

    return () => h("span", status.value.state);
  });

  const view = mount(
    defineComponent(
      () => () =>
        h(TraceProvider, { trace }, () => [
          h(createStarter(trace)),
          h(Watcher),
        ]),
    ),
  );

  views.add(view);
  await nextTick();

  expect(view.text()).toBe("started");
  expect(reported).toHaveLength(1);
  expect(() => reported[0]?.()).toThrow(failure);
});

test("a callback that throws cannot disturb the status, and its error reaches the host", async () => {
  const { trace } = create();
  const failure = new Error("the callback failed");
  const reported: (() => void)[] = [];

  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    reported.push(task);
  });

  const { view } = render(
    trace,
    defineComponent(() => {
      const status = useTraceStatus(() => {
        throw failure;
      });

      return () => h("span", status.value.state);
    }),
  );

  trace.start();
  await nextTick();

  expect(view.text()).toBe("started");
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

  render(
    trace,
    defineComponent(() => {
      useTraceStatus(() => Promise.reject(failure));

      return () => null;
    }),
  );

  trace.start();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(reported).toHaveLength(1);
  expect(() => reported[0]?.()).toThrow(failure);
});

test("mounting and unmounting call nothing on the Trace but the subscriptions the composables asked for", () => {
  const { mock, trace } = create();

  trace.start();

  const spy = spyOnTrace(trace);

  const { view } = render(
    trace,
    defineComponent(() => {
      useTrace();
      useTraceStatus(vi.fn());
      useDestinationStatus("product");
      useConsent();

      return () => null;
    }),
  );

  expect(spy.calls).toEqual([
    ["status.subscribe"],
    ["status.subscribe"],
    ["product.status.subscribe"],
    ["consent.subscribe"],
  ]);

  unmount(view);

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

  const { view } = render(
    trace,
    defineComponent(() => {
      useTraceStatus(vi.fn());
      useDestinationStatus("product", vi.fn());
      useConsent(vi.fn());

      return () => null;
    }),
  );

  expect(spy.live).toEqual({ status: 2, "product.status": 2, consent: 2 });

  unmount(view);

  expect(spy.live).toEqual({ status: 0, "product.status": 0, consent: 0 });
});

test("a remount opens nothing, tracks nothing and never holds one composable's listener twice", async () => {
  const { mock, trace } = create();
  const spy = spyOnTrace(trace);
  const first = render(trace, View);

  expect(spy.live).toEqual({ status: 1, "product.status": 1, consent: 1 });

  unmount(first.view);

  const second = render(trace, View);

  await nextTick();

  expect(second.view.text()).toBe("idle/idle/unknown/unknown");
  expect(spy.live).toEqual({ status: 1, "product.status": 1, consent: 1 });

  unmount(second.view);

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

  const OpenButton = defineComponent(() => {
    const trace = useTrace();

    const handleOpenClick = () => {
      trace.value.track("App Opened");
    };

    return () => h("button", { onClick: handleOpenClick }, "Open");
  });

  const { view } = render(trace, OpenButton);

  await nextTick();

  expect(accepted.mock.calls).toEqual([]);
  expect(mock.tracks).toEqual([]);

  await view.get("button").trigger("click");

  expect(accepted.mock.calls).toEqual([["App Opened"]]);
});
