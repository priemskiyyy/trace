import { afterEach, expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { Receipt } from "src/types/Receipt";
import type { TraceDiagnosticEvent } from "src/types/TraceDiagnosticEvent";
import { event } from "src/utils/event";
import { Trace } from "src/utils/Trace";

afterEach(() => {
  vi.useRealTimers();
});

const events = {
  "App Opened": event(),
  "Search Performed": event<{ query: string }>(),
};

const isDeepFrozen = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) {
    return true;
  }

  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
};

test("the snapshot holds the status, the identity, consent, pending receipts and each destination's status and counts", async () => {
  const product = createMockAdapter({ name: "amplitude" });
  const research = createMockAdapter({ name: "posthog", hold: true });

  const trace = new Trace({
    events,
    destinations: { product: product.adapter, research: research.adapter },
    consent: { product: ["analytics"] },
  });

  trace.consent.set({ analytics: "granted" });
  trace.user({ id: "ada" });

  const receipt = trace.track("App Opened");

  expect(trace.diagnostics.get()).toEqual({
    status: { state: "idle" },
    identity: { generation: 1, user: { id: "ada" } },
    consent: { analytics: "granted" },
    pendingReceipts: 1,
    destinations: [
      {
        name: "product",
        adapter: { name: "amplitude" },
        status: { state: "idle" },
        buffered: 1,
        inFlight: 0,
      },
      {
        name: "research",
        adapter: { name: "posthog" },
        status: { state: "idle" },
        buffered: 1,
        inFlight: 0,
      },
    ],
  });

  trace.start();

  expect(trace.diagnostics.get()).toMatchObject({
    status: { state: "started" },
    pendingReceipts: 1,
    destinations: [
      { status: { state: "ready" }, buffered: 0, inFlight: 0 },
      { status: { state: "ready" }, buffered: 0, inFlight: 1 },
    ],
  });

  research.tracks[0]?.settle();
  await receipt.settled;

  expect(trace.diagnostics.get()).toMatchObject({
    pendingReceipts: 0,
    destinations: [{ inFlight: 0 }, { inFlight: 0 }],
  });
});

test("a failed destination's snapshot status is its state alone, while its handle keeps the error", () => {
  const failure = new Error("apiKey=secret was refused");

  const trace = new Trace({
    events,
    destinations: {
      product: createMockAdapter({
        onOpen: () => {
          throw failure;
        },
      }).adapter,
    },
  });

  trace.start();

  expect(trace.diagnostics.get().destinations[0]?.status).toEqual({
    state: "failed",
  });
  expect(trace.destination("product").status.get()).toEqual({
    state: "failed",
    error: failure,
  });
});

test("the snapshot is frozen, kept until something changes, and cannot be rewritten by an observer", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const snapshot = trace.diagnostics.get();

  Reflect.set(snapshot, "pendingReceipts", 42);

  expect(trace.diagnostics.get()).toBe(snapshot);
  expect(snapshot.pendingReceipts).toBe(0);
  expect(isDeepFrozen(snapshot)).toBe(true);

  trace.user({ id: "ada" });

  expect(trace.diagnostics.get()).not.toBe(snapshot);
  expect(trace.diagnostics.get().identity).toEqual({
    generation: 1,
    user: { id: "ada" },
  });
});

test("observers of the snapshot are told once per turn that it changed", async () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const listener = vi.fn();

  trace.diagnostics.subscribe(listener);
  trace.user({ id: "ada" });
  trace.start();
  trace.track("App Opened");

  expect(listener.mock.calls).toEqual([]);

  await Promise.resolve();

  expect(listener.mock.calls).toEqual([[]]);
});

test("the timeline names what happened, from start to disposal", async () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    consent: { product: ["analytics"] },
  });

  const types: string[] = [];

  trace.diagnostics.events.subscribe(({ type }) => types.push(type));
  trace.start();
  trace.consent.set({ analytics: "granted" });
  trace.user({ id: "ada" });
  trace.track("App Opened");
  trace.track("App Opened", undefined, { to: [] });
  await trace.flush();
  trace.dispose();

  expect(types).toEqual([
    "trace started",
    "destination ready",
    "consent changed",
    "user changed",
    "event accepted",
    "event submitted",
    "event dropped",
    "flush started",
    "flush completed",
    "destination disposed",
    "trace disposed",
  ]);
});

test("each record carries its source, its destination, its event and plain data only", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    now: () => 1_000,
  });

  const recorded: TraceDiagnosticEvent[] = [];

  trace.diagnostics.events.subscribe((diagnostic) => recorded.push(diagnostic));
  trace.start();

  const accepted = trace.track("Search Performed", { query: "shoes" });
  const dropped = trace.track("App Opened", undefined, { to: [] });

  expect(recorded.slice(-3)).toEqual([
    {
      source: "event",
      type: "event accepted",
      destination: null,
      event: { id: accepted.id },
      timestamp: 1_000,
      context: {
        name: "Search Performed",
        destinations: ["product"],
        losses: [],
      },
    },
    {
      source: "event",
      type: "event submitted",
      destination: { name: "product" },
      event: { id: accepted.id },
      timestamp: 1_000,
      context: { evidence: "sdk-call-returned", losses: [] },
    },
    {
      source: "event",
      type: "event dropped",
      destination: null,
      event: { id: dropped.id },
      timestamp: 1_000,
      context: { name: "App Opened", reason: "not-routed" },
    },
  ]);
  expect(recorded.every(isDeepFrozen)).toBe(true);
});

test("every list and object a record carries is frozen where the core makes it, so each published event is frozen through and through", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    consent: { product: ["analytics"] },
  });

  const recorded: TraceDiagnosticEvent[] = [];

  trace.diagnostics.events.subscribe((diagnostic) => recorded.push(diagnostic));
  trace.start();
  // @ts-expect-error An untyped caller named a purpose the consent option does not declare.
  trace.consent.set({ analytics: "granted", marketing: "granted" });
  trace.user({ id: "ada" });
  // @ts-expect-error A JavaScript caller can pass a context that is not an object.
  trace.track("App Opened", undefined, { context: "home" });

  expect(
    recorded.flatMap(({ type, context }) => {
      if (
        type !== "consent changed" &&
        type !== "user changed" &&
        type !== "event accepted"
      ) {
        return [];
      }

      return [[type, context]];
    }),
  ).toEqual([
    [
      "consent changed",
      { decisions: { analytics: "granted" }, refused: ["marketing"] },
    ],
    ["user changed", { generation: 1, user: { id: "ada" } }],
    [
      "event accepted",
      {
        name: "App Opened",
        destinations: ["product"],
        losses: [{ path: "context", reason: "invalid" }],
      },
    ],
  ]);
  expect(recorded.every(isDeepFrozen)).toBe(true);
});

test("a secret value appears in no diagnostic event and in no snapshot", () => {
  const secret = "s3cr3t-value";
  const recorded: TraceDiagnosticEvent[] = [];
  const snapshots: unknown[] = [];

  const trace = new Trace({
    events,
    destinations: {
      product: createMockAdapter().adapter,
      failing: {
        name: "failing",
        open: () => ({
          native: null,
          track: () => ({ status: "failed", error: new Error(secret) }),
        }),
      },
    },
    defaults: { context: { note: secret } },
  });

  trace.diagnostics.events.subscribe((diagnostic) => {
    recorded.push(diagnostic);
    snapshots.push(trace.diagnostics.get());
  });
  trace.start();
  trace.user({ id: "ada", traits: { note: secret } });
  trace.group("workspace", { id: "w_1", traits: { note: secret } });
  trace.context({ screen: secret });
  trace.track("Search Performed", { query: secret }, { context: { secret } });
  // @ts-expect-error A JavaScript caller can pass properties that are not an object.
  trace.track("Search Performed", secret);
  trace.dispose();
  snapshots.push(trace.diagnostics.get());

  expect(recorded.map(({ type }) => type)).toEqual([
    "trace started",
    "destination ready",
    "destination ready",
    "user changed",
    "event accepted",
    "event submitted",
    "event failed",
    "event dropped",
    "destination disposed",
    "destination disposed",
    "trace disposed",
  ]);
  expect(JSON.stringify({ recorded, snapshots })).not.toContain(secret);
});

test("a name that is not a string is recorded as null, so nothing it holds reaches a diagnostic", () => {
  const recorded: TraceDiagnosticEvent[] = [];

  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    consent: { product: ["analytics"] },
    now: () => 1_000,
  });

  trace.diagnostics.events.subscribe((diagnostic) => recorded.push(diagnostic));

  // @ts-expect-error A JavaScript caller can pass a name that is not a string.
  const receipt = trace.track({ password: "hunter2" });

  expect(recorded).toEqual([
    {
      source: "event",
      type: "event dropped",
      destination: null,
      event: { id: receipt.id },
      timestamp: 1_000,
      context: { name: null, reason: "invalid" },
    },
  ]);
});

test("with no listener, recording costs nothing: the clock is read only for the event itself", () => {
  const now = vi.fn(() => 1_000);

  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    now,
  });

  trace.start();
  trace.user({ id: "ada" });
  trace.track("App Opened");

  expect(now.mock.calls).toEqual([[]]);

  trace.diagnostics.events.subscribe(() => {});
  now.mockClear();
  trace.track("App Opened");

  expect(now.mock.calls).toEqual([[], [], []]);
});

test("observing diagnostics is passive: it opens nothing, starts no timer and creates no event", () => {
  vi.useFakeTimers();

  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.diagnostics.subscribe(() => {});
  trace.diagnostics.events.subscribe(() => {});
  trace.diagnostics.get();
  trace.status.subscribe(() => {});
  trace.consent.subscribe(() => {});
  trace.destination("product").status.subscribe(() => {});

  expect(mock.sessions).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
  expect(trace.diagnostics.get().pendingReceipts).toBe(0);
});

test("pending receipts count down as receipts settle, including those disposal settles", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter({ hold: true }).adapter },
  });

  trace.start();
  trace.track("App Opened");
  trace.track("App Opened");

  expect(trace.diagnostics.get().pendingReceipts).toBe(2);

  trace.dispose();

  expect(trace.diagnostics.get().pendingReceipts).toBe(0);
});

test("a receipt listener that disposes the Trace on the landing that settles its receipt leaves no receipt pending in the final snapshot", async () => {
  const mock = createMockAdapter({ hold: true });
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();

  const receipt = trace.track("App Opened");

  receipt.status.subscribe(() => trace.dispose());
  mock.tracks[0]?.settle();

  await expect(receipt.settled).resolves.toEqual({
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
  expect(trace.diagnostics.get()).toMatchObject({
    status: { state: "disposed" },
    pendingReceipts: 0,
  });
});

test("a receipt listener that disposes the Trace while a switch drops the previous user's events from two destinations leaves no receipt pending in the final snapshot", () => {
  const trace = new Trace({
    events,
    destinations: {
      product: createMockAdapter().adapter,
      research: createMockAdapter().adapter,
    },
  });

  trace.user({ id: "ada" });

  const receipt = trace.track("App Opened");

  receipt.status.subscribe(() => trace.dispose());
  trace.user({ id: "bob" });

  expect(receipt.status.get()).toEqual({
    state: "settled",
    outcomes: {
      product: { status: "dropped", reason: "identity-changed" },
      research: { status: "dropped", reason: "identity-changed" },
    },
  });
  expect(trace.diagnostics.get()).toMatchObject({
    status: { state: "disposed" },
    pendingReceipts: 0,
  });
});

test("a track dropped as reentrant inside an events listener or an adapter call still reaches diagnostics listeners as event dropped", () => {
  const inner: Receipt[] = [];

  const mock = createMockAdapter({
    onTrack: () => {
      inner.push(trace.track("App Opened"));
    },
  });

  const trace = new Trace({ events, destinations: { product: mock.adapter } });
  const dropped: Array<{ event: string | null; context: unknown }> = [];

  trace.diagnostics.events.subscribe(({ type, event: tracked, context }) => {
    if (type === "event dropped") {
      dropped.push({ event: tracked?.id ?? null, context });
    }
  });
  trace.events.subscribe(() => {
    inner.push(trace.track("App Opened"));
  });
  trace.start();
  trace.track("App Opened");

  expect(dropped).toStrictEqual([
    {
      event: inner[0]?.id ?? null,
      context: { name: "App Opened", reason: "reentrant" },
    },
    {
      event: inner[1]?.id ?? null,
      context: { name: "App Opened", reason: "reentrant" },
    },
  ]);
});

test("a diagnostics listener that tracks on every diagnostic makes one track, dropped as reentrant, hears only the diagnostics of the event that set it off, and the call returns", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const heard: Array<{ type: string; event: string | null }> = [];
  const receipts: Receipt[] = [];

  trace.diagnostics.events.subscribe(({ type, event: tracked }) => {
    heard.push({ type, event: tracked?.id ?? null });

    if (receipts.length < 10) {
      receipts.push(trace.track("App Opened"));
    }
  });

  const original = trace.track("App Opened");

  expect(heard).toStrictEqual([{ type: "event accepted", event: original.id }]);
  expect(receipts.map((receipt) => receipt.status.get())).toStrictEqual([
    { state: "dropped", reason: "reentrant" },
  ]);
});

test("a snapshot listener that tracks on every notification makes one track, dropped as reentrant and recorded only on its receipt, and the notifications end", async () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });
  const heard: string[] = [];
  const receipts: Receipt[] = [];

  trace.start();
  trace.diagnostics.events.subscribe(({ type }) => {
    heard.push(type);
  });
  trace.diagnostics.subscribe(() => {
    if (receipts.length < 10) {
      receipts.push(trace.track("App Opened"));
    }
  });
  trace.track("App Opened");
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(receipts.map((receipt) => receipt.status.get())).toStrictEqual([
    { state: "dropped", reason: "reentrant" },
  ]);
  expect(heard).not.toContain("event dropped");
  expect(mock.sessions[0]?.events).toHaveLength(1);
});

test("a diagnostics listener that tracks while the Trace is disposed hears none of its own drops, and disposal returns", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const heard: string[] = [];
  const receipts: Receipt[] = [];

  trace.track("App Opened");
  trace.diagnostics.events.subscribe(({ type }) => {
    heard.push(type);

    if (receipts.length < 10) {
      receipts.push(trace.track("App Opened"));
    }
  });
  trace.dispose();

  expect(heard).toStrictEqual([
    "destination disposed",
    "event dropped",
    "trace disposed",
  ]);
  expect(receipts.map((receipt) => receipt.status.get())).toStrictEqual([
    { state: "dropped", reason: "disposed" },
    { state: "dropped", reason: "disposed" },
    { state: "dropped", reason: "disposed" },
  ]);
});
