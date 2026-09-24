import { expect, test, vi } from "vitest";

import type { DiagnosticRecord } from "src/types/internal/DiagnosticRecord";
import type { TraceDiagnosticEvent } from "src/types/TraceDiagnosticEvent";
import type { TraceSnapshot } from "src/types/TraceSnapshot";
import { Diagnostics } from "src/utils/internal/diagnostics/Diagnostics";

const snapshotOf = (pendingReceipts: number): TraceSnapshot => ({
  status: { state: "started" },
  identity: { generation: 0, user: null },
  consent: {},
  pendingReceipts,
  destinations: [],
});

const create = () => {
  const runtime = { pendingReceipts: 0 };
  const read = vi.fn(() => snapshotOf(runtime.pendingReceipts));
  const now = vi.fn(() => 42);
  const diagnostics = new Diagnostics({ read, now });

  return { diagnostics, runtime, read, now };
};

const accepted: DiagnosticRecord = {
  source: "event",
  type: "event accepted",
  destination: null,
  event: "event-1",
};

const isDeepFrozen = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) {
    return true;
  }

  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
};

test("the snapshot is read lazily and kept until something changes", () => {
  const { diagnostics, runtime, read } = create();

  expect(read).not.toHaveBeenCalled();

  const first = diagnostics.api.get();

  runtime.pendingReceipts = 3;

  expect(diagnostics.api.get()).toBe(first);
  expect(first).toEqual(snapshotOf(0));
  expect(read.mock.calls).toEqual([[]]);

  diagnostics.changed();

  expect(diagnostics.api.get()).toEqual(snapshotOf(3));
  expect(read.mock.calls).toEqual([[], []]);
});

test("several changes in one turn notify observers once", async () => {
  const { diagnostics } = create();
  const listener = vi.fn();

  diagnostics.api.subscribe(listener);

  diagnostics.changed();
  diagnostics.changed();
  diagnostics.changed();

  expect(listener).not.toHaveBeenCalled();

  await Promise.resolve();

  expect(listener.mock.calls).toEqual([[]]);
});

test("with no listener, recording an event costs a check: the clock is not read and the context is left as it was", () => {
  const { diagnostics, now } = create();
  const listener = vi.fn<(event: TraceDiagnosticEvent) => void>();
  const context = { reason: "consent" };

  diagnostics.record({ ...accepted, context });

  expect(now).not.toHaveBeenCalled();
  expect(Object.isFrozen(context)).toBe(false);

  const stop = diagnostics.api.events.subscribe(listener);

  diagnostics.record({ ...accepted, context: { reason: "consent" } });
  stop();
  diagnostics.record({ ...accepted, context });

  expect(listener.mock.calls).toEqual([
    [
      {
        source: "event",
        type: "event accepted",
        destination: null,
        event: { id: "event-1" },
        timestamp: 42,
        context: { reason: "consent" },
      },
    ],
  ]);
  expect(now.mock.calls).toEqual([[]]);
  expect(Object.isFrozen(context)).toBe(false);
});

test("a published event names its destination and event, and is one frozen event every listener shares", () => {
  const { diagnostics } = create();
  const first = vi.fn<(event: TraceDiagnosticEvent) => void>();
  const second = vi.fn<(event: TraceDiagnosticEvent) => void>();

  const losses = [
    Object.freeze({ path: "properties.card.cvc", reason: "redacted" }),
  ];

  Object.freeze(losses);
  diagnostics.api.events.subscribe(first);
  diagnostics.api.events.subscribe(second);

  diagnostics.record({
    source: "destination",
    type: "event submitted",
    destination: "product",
    event: "event-1",
    context: { losses },
  });

  const published = first.mock.calls[0]?.[0];

  expect(published).toEqual({
    source: "destination",
    type: "event submitted",
    destination: { name: "product" },
    event: { id: "event-1" },
    timestamp: 42,
    context: { losses: [{ path: "properties.card.cvc", reason: "redacted" }] },
  });
  expect(second.mock.calls).toEqual([[published]]);
  expect(second.mock.calls[0]?.[0]).toBe(published);
  expect(isDeepFrozen(published)).toBe(true);
});

test("a listener that throws does not stop the others, for events or snapshots", () => {
  vi.spyOn(globalThis, "queueMicrotask").mockImplementation(() => {});

  const { diagnostics } = create();
  const events = vi.fn<(event: TraceDiagnosticEvent) => void>();
  const snapshots = vi.fn();

  diagnostics.api.events.subscribe(() => {
    throw new Error("listener failed");
  });
  diagnostics.api.events.subscribe(events);
  diagnostics.api.subscribe(() => {
    throw new Error("listener failed");
  });
  diagnostics.api.subscribe(snapshots);

  diagnostics.record(accepted);
  diagnostics.dispose();

  expect(events.mock.calls.map(([event]) => event.type)).toEqual([
    "event accepted",
    "trace disposed",
  ]);
  expect(snapshots.mock.calls).toEqual([[]]);
});

test("a listener removed by an earlier one while an event is delivered is not called", () => {
  const { diagnostics } = create();
  const removed = vi.fn();

  let stopRemoved = () => {};

  diagnostics.api.events.subscribe(() => stopRemoved());
  stopRemoved = diagnostics.api.events.subscribe(removed);

  diagnostics.record(accepted);

  expect(removed).not.toHaveBeenCalled();
});

test("disposal sends one last trace disposed event and notification, then goes quiet with the snapshot it ended with", () => {
  const { diagnostics, runtime, read } = create();
  const listener = vi.fn();
  const events = vi.fn<(event: TraceDiagnosticEvent) => void>();

  diagnostics.api.subscribe(listener);
  diagnostics.api.events.subscribe(events);
  runtime.pendingReceipts = 2;

  diagnostics.dispose();
  diagnostics.dispose();
  runtime.pendingReceipts = 5;
  diagnostics.changed();
  diagnostics.record(accepted);

  expect(listener.mock.calls).toEqual([[]]);
  expect(events.mock.calls).toEqual([
    [
      {
        source: "runtime",
        type: "trace disposed",
        destination: null,
        event: null,
        timestamp: 42,
        context: null,
      },
    ],
  ]);
  expect(diagnostics.api.get()).toEqual(snapshotOf(2));
  expect(diagnostics.api.get()).toBe(diagnostics.api.get());
  expect(read.mock.calls).toEqual([[]]);
});

test("subscribing after disposal is a no-op rather than a leak", async () => {
  const { diagnostics } = create();
  const listener = vi.fn();

  diagnostics.dispose();

  const stopSnapshot = diagnostics.api.subscribe(listener);
  const stopEvents = diagnostics.api.events.subscribe(listener);

  diagnostics.changed();
  diagnostics.record(accepted);
  await Promise.resolve();
  stopSnapshot();
  stopEvents();

  expect(listener).not.toHaveBeenCalled();
});

test("a record made from inside a listener reaches every listener after the event being delivered", () => {
  const { diagnostics } = create();
  const seen: string[] = [];

  diagnostics.api.events.subscribe((event) => {
    seen.push(`first: ${event.type}`);

    if (event.type === "event accepted") {
      diagnostics.record({
        source: "destination",
        type: "event submitted",
        destination: "product",
        event: "event-1",
      });
    }
  });
  diagnostics.api.events.subscribe((event) => {
    seen.push(`second: ${event.type}`);
  });

  diagnostics.record(accepted);

  expect(seen).toEqual([
    "first: event accepted",
    "second: event accepted",
    "first: event submitted",
    "second: event submitted",
  ]);
});

test("disposing from inside a listener still ends every listener's stream with trace disposed", () => {
  const { diagnostics } = create();
  const seen: string[] = [];

  diagnostics.api.events.subscribe((event) => {
    seen.push(`first: ${event.type}`);

    if (event.type === "event accepted") {
      diagnostics.dispose();
    }
  });
  diagnostics.api.events.subscribe((event) => {
    seen.push(`second: ${event.type}`);

    if (event.type === "trace disposed") {
      diagnostics.record(accepted);
    }
  });

  diagnostics.record(accepted);
  diagnostics.record(accepted);

  expect(seen).toEqual([
    "first: event accepted",
    "second: event accepted",
    "first: trace disposed",
    "second: trace disposed",
  ]);
});
