import { afterEach, expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { Receipt } from "src/types/Receipt";
import type { TrackedEvent } from "src/types/TrackedEvent";
import { createDeferred } from "src/utils/common/createDeferred";
import { event } from "src/utils/event";
import { Trace } from "src/utils/Trace";

afterEach(() => {
  vi.useRealTimers();
});

const events = {
  "App Opened": event(),
  "Search Performed": event<{ query: string }>(),
};

const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const collectMicrotasks = () => {
  const tasks: Array<() => void> = [];

  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    tasks.push(task);
  });

  return tasks;
};

test("a listener receives each accepted event after its acceptance and before any destination does", () => {
  const log: string[] = [];
  const streamed: TrackedEvent[] = [];

  const mock = createMockAdapter({
    onTrack: () => {
      log.push("track");
    },
  });

  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.diagnostics.events.subscribe(({ type }) => log.push(type));
  trace.events.subscribe((tracked) => {
    streamed.push(tracked);
    log.push(`stream ${tracked.name}`);
  });
  trace.start();
  log.length = 0;

  trace.track("Search Performed", { query: "shoes" });

  expect(log).toEqual([
    "event accepted",
    "stream Search Performed",
    "track",
    "event submitted",
  ]);
  expect(streamed[0]).toBe(mock.sessions[0]?.events[0]);
  expect(Object.isFrozen(streamed[0])).toBe(true);
});

test("an event dropped at acceptance never reaches a listener", () => {
  const listener = vi.fn();

  const trace = new Trace({
    events,
    destinations: {
      product: createMockAdapter().adapter,
      research: createMockAdapter().adapter,
    },
    consent: { product: ["analytics"] },
    privacy: {
      redact: (key) => {
        if (key === "query") {
          throw new Error("redact exploded");
        }

        return false;
      },
    },
  });

  trace.events.subscribe(listener);
  trace.start();

  trace.track("App Opened", undefined, { to: ["product"] });
  trace.track("App Opened", undefined, { to: [] });
  trace.track("Search Performed", { query: "shoes" });
  // @ts-expect-error A JavaScript caller can pass properties that are not an object.
  trace.track("Search Performed", "shoes");
  trace.dispose();
  trace.track("App Opened");

  expect(listener).not.toHaveBeenCalled();
});

test("a listener never receives history", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const names: string[] = [];

  trace.start();
  trace.track("App Opened");
  trace.events.subscribe((tracked) => names.push(tracked.name));
  trace.track("Search Performed", { query: "shoes" });

  expect(names).toEqual(["Search Performed"]);
});

test("a listener that throws is isolated: its error is rethrown on a microtask, and other listeners and the receipt are unaffected", () => {
  const tasks = collectMicrotasks();
  const failure = new Error("listener failed");
  const after = vi.fn();
  const types: string[] = [];

  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  trace.diagnostics.events.subscribe(({ type }) => types.push(type));
  trace.events.subscribe(() => {
    throw failure;
  });
  trace.events.subscribe(after);
  trace.start();

  const receipt = trace.track("App Opened");

  expect(after.mock.calls).toEqual([
    [expect.objectContaining({ name: "App Opened" })],
  ]);
  expect(receipt.status.get()).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  expect(types).toEqual([
    "trace started",
    "destination ready",
    "event accepted",
    "listener failed",
    "event submitted",
  ]);
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toThrow(failure);
});

test("a listener whose promise rejects is recorded as listener failed too, and its rejection is rethrown on a microtask", async () => {
  const tasks = collectMicrotasks();
  const failure = new Error("listener rejected");
  const answer = createDeferred<void>();
  const recorded: { type: string; event: { id: string } | null }[] = [];

  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  trace.diagnostics.events.subscribe(({ type, event }) =>
    recorded.push({ type, event }),
  );
  trace.events.subscribe(() => answer.promise);
  trace.start();

  const receipt = trace.track("App Opened");

  answer.reject(failure);
  await nextMacrotask();

  expect(recorded).toEqual([
    { type: "trace started", event: null },
    { type: "destination ready", event: null },
    { type: "event accepted", event: { id: receipt.id } },
    { type: "event submitted", event: { id: receipt.id } },
    { type: "listener failed", event: { id: receipt.id } },
  ]);
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toThrow(failure);
});

test("a listener that is not a function is never called, fails nothing and costs the other listeners nothing", () => {
  const tasks = collectMicrotasks();
  const types: string[] = [];
  const names: string[] = [];

  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  trace.diagnostics.events.subscribe(({ type }) => types.push(type));
  // @ts-expect-error A JavaScript caller can subscribe something that is not a function.
  trace.events.subscribe("listener");
  trace.events.subscribe((tracked) => names.push(tracked.name));
  trace.start();
  trace.track("App Opened");

  expect(names).toEqual(["App Opened"]);
  expect(types).toEqual([
    "trace started",
    "destination ready",
    "event accepted",
    "event submitted",
  ]);
  expect(tasks).toEqual([]);
});

test("a track made from inside a listener is dropped as reentrant", () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });
  const inner: Receipt[] = [];

  trace.events.subscribe(() => {
    inner.push(trace.track("App Opened"));
  });
  trace.start();
  trace.track("App Opened");

  expect(inner.map((receipt) => receipt.status.get())).toEqual([
    { state: "dropped", reason: "reentrant" },
  ]);
  expect(mock.sessions[0]?.events).toHaveLength(1);
});

test("subscribing opens nothing, starts no timer and creates no event", () => {
  vi.useFakeTimers();

  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.events.subscribe(() => {});

  expect(mock.sessions).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
  expect(trace.diagnostics.get().pendingReceipts).toBe(0);
});

test("each subscription is its own, and an unsubscribed listener hears nothing more, even mid-delivery", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const heard: string[] = [];
  const twice = () => heard.push("twice");

  const stopLater = trace.events.subscribe(() => {
    heard.push("first");
    stopSecond();
  });

  const stopSecond = trace.events.subscribe(() => heard.push("second"));
  const stopTwice = trace.events.subscribe(twice);

  trace.events.subscribe(twice);
  trace.start();
  trace.track("App Opened");
  stopLater();
  stopTwice();
  trace.track("App Opened");

  expect(heard).toEqual(["first", "twice", "twice", "twice"]);
});

test("after dispose a listener hears nothing, and a new subscription holds nothing", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const listener = vi.fn();

  trace.events.subscribe(listener);
  trace.start();
  trace.dispose();

  const stop = trace.events.subscribe(listener);

  trace.track("App Opened");
  stop();

  expect(listener).not.toHaveBeenCalled();
});
