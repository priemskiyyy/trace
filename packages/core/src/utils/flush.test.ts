import { afterEach, expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import { event } from "src/utils/event";
import { Trace } from "src/utils/Trace";

afterEach(() => {
  vi.useRealTimers();
});

const events = { "App Opened": event() };

test("flush waits for the work accepted before it, then for each provider's own flush", async () => {
  vi.useFakeTimers();

  const flushing = createMockAdapter({ hold: true });
  const bare = createMockAdapter({ flush: false });

  const trace = new Trace({
    events,
    destinations: { flushing: flushing.adapter, bare: bare.adapter },
  });

  trace.start();
  trace.track("App Opened");

  const flushed = trace.flush({ timeout: 500 });

  flushing.tracks[0]?.settle();

  await expect(flushed).resolves.toEqual({
    drained: true,
    destinations: {
      flushing: { status: "flushed" },
      bare: { status: "unsupported" },
    },
  });
  expect(
    flushing.sessions[0]?.flushes.map(({ context }) => context.timeout),
  ).toEqual([500]);
});

test("flush is a barrier: work accepted after the call does not extend it", async () => {
  const mock = createMockAdapter({ hold: true });
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();
  trace.track("App Opened");

  const flushed = trace.flush({ timeout: 1_000 });

  trace.track("App Opened");
  mock.tracks[0]?.settle();

  await expect(flushed).resolves.toEqual({
    drained: true,
    destinations: { product: { status: "flushed" } },
  });
  expect(trace.diagnostics.get().destinations[0]?.inFlight).toBe(1);
});

test("a destination that is not ready answers not-ready, and the flush is not drained", async () => {
  const ready = createMockAdapter();

  const failing = createMockAdapter({
    onOpen: () => {
      throw new Error("the SDK is not initialized");
    },
  });

  const trace = new Trace({
    events,
    destinations: { ready: ready.adapter, failing: failing.adapter },
  });

  await expect(trace.flush()).resolves.toEqual({
    drained: false,
    destinations: {
      ready: { status: "not-ready" },
      failing: { status: "not-ready" },
    },
  });

  trace.start();

  await expect(trace.flush()).resolves.toEqual({
    drained: false,
    destinations: {
      ready: { status: "flushed" },
      failing: { status: "not-ready" },
    },
  });
});

test("a flush that runs out of time answers timeout, is not drained, and cancels nothing", async () => {
  vi.useFakeTimers();

  const mock = createMockAdapter({ hold: true });
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();

  const receipt = trace.track("App Opened");
  const flushed = trace.flush({ timeout: 200 });

  await vi.advanceTimersByTimeAsync(200);

  await expect(flushed).resolves.toEqual({
    drained: false,
    destinations: { product: { status: "timeout" } },
  });
  expect(receipt.status.get().state).toBe("pending");

  mock.tracks[0]?.settle();
  await vi.advanceTimersByTimeAsync(0);

  expect(receipt.status.get()).toMatchObject({
    state: "settled",
    outcomes: { product: { status: "submitted" } },
  });
});

test("the flush timeout defaults to two seconds", async () => {
  vi.useFakeTimers();

  const mock = createMockAdapter({ flush: "hold" });
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();

  let result: unknown = null;

  trace.flush().then((answer) => {
    result = answer;
  });

  await vi.advanceTimersByTimeAsync(1_999);

  expect(result).toBeNull();
  expect(mock.sessions[0]?.flushes[0]?.context.timeout).toBe(2_000);

  await vi.advanceTimersByTimeAsync(1);

  expect(result).toEqual({
    drained: false,
    destinations: { product: { status: "timeout" } },
  });
});

test("the provider's flush gets what is left of the time once what came before the call was handed off", async () => {
  vi.useFakeTimers();

  let release: () => void = () => {};

  const mock = createMockAdapter({
    onIdentity: () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  });

  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.user({ id: "ada" });
  trace.start();
  trace.track("App Opened");

  const flushed = trace.flush({ timeout: 1_000 });

  await vi.advanceTimersByTimeAsync(200);

  expect(mock.sessions[0]?.flushes).toEqual([]);

  release();
  await flushed;

  expect(mock.sessions[0]?.events).toHaveLength(1);
  expect(mock.sessions[0]?.flushes[0]?.context.timeout).toBe(800);
});

test("flush never rejects: a provider flush that throws answers failed, and options that cannot be used are tolerated", async () => {
  const failure = new Error("flush exploded");

  const trace = new Trace({
    events,
    destinations: {
      product: {
        name: "throwing",
        open: () => ({
          native: null,
          track: () => ({ status: "submitted", evidence: "sdk-call-returned" }),
          flush: () => {
            throw failure;
          },
        }),
      },
    },
  });

  trace.start();

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { product: { status: "failed", error: failure } },
  });

  const unreadable = {
    get timeout(): never {
      throw new Error("unreadable timeout");
    },
  };

  for (const options of [null, "fast", { timeout: Number.NaN }, unreadable]) {
    // @ts-expect-error A JavaScript caller can pass anything as the options.
    await expect(trace.flush(options)).resolves.toMatchObject({
      destinations: { product: { status: "failed", error: failure } },
    });
  }
});

test("flush records when it started and when it completed", async () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const recorded: unknown[] = [];

  trace.diagnostics.events.subscribe(({ type, source, context }) => {
    if (type.startsWith("flush")) {
      recorded.push({ type, source, context });
    }
  });
  trace.start();
  await trace.flush({ timeout: 300 });

  expect(recorded).toEqual([
    { type: "flush started", source: "runtime", context: { timeout: 300 } },
    { type: "flush completed", source: "runtime", context: { drained: true } },
  ]);
});

test("a flush after dispose answers not-ready for every destination", async () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();
  trace.dispose();

  await expect(trace.flush()).resolves.toEqual({
    drained: false,
    destinations: { product: { status: "not-ready" } },
  });
  expect(mock.sessions[0]?.flushes).toEqual([]);
});

test("the flush result is frozen and keeps a destination named __proto__ as its own key", async () => {
  const trace = new Trace({
    events,
    destinations: { ["__proto__"]: createMockAdapter().adapter },
  });

  trace.start();

  const result = await trace.flush();

  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.destinations)).toBe(true);
  expect(Object.hasOwn(result.destinations, "__proto__")).toBe(true);
});
