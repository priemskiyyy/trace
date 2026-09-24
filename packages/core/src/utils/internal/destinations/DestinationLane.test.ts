import { afterEach, expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { AnalyticsSession } from "src/types/AnalyticsSession";
import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { IdentityTarget } from "src/types/internal/IdentityTarget";
import { createDeferred } from "src/utils/common/createDeferred";
import { createLane } from "src/utils/internal/destinations/createLane.fixture";
import { TraceError } from "src/utils/TraceError";

afterEach(() => {
  vi.useRealTimers();
});

const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const ADA: IdentityTarget = {
  generation: 1,
  user: { id: "ada" },
  traits: {},
  groups: {},
};

const ADA_PRO: IdentityTarget = { ...ADA, traits: { plan: "pro" } };

const SUBMITTED: DestinationOutcome = {
  status: "submitted",
  evidence: "sdk-call-returned",
  event: null,
  losses: [],
};

const answering = (answer: unknown): AnalyticsAdapter => ({
  name: "answering",
  // @ts-expect-error A JavaScript adapter can answer anything from open.
  open: () => answer,
});

const withSession = (
  change: (session: AnalyticsSession) => AnalyticsSession,
): AnalyticsAdapter => {
  const mock = createMockAdapter();

  return { name: "changed", open: () => change(mock.adapter.open()) };
};

const createHostilePromise = <TValue>(read: string, value: TValue) => {
  const promise = Promise.resolve(value);

  Object.defineProperty(promise, read, {
    get() {
      throw new Error(`reading ${read} threw`);
    },
  });

  return promise;
};

test("a lane is cold until it is started", () => {
  vi.useFakeTimers();

  const { lane, log, records } = createLane();

  expect(lane.status.get()).toEqual({ state: "idle" });
  expect(lane.native()).toBeNull();
  expect(lane.buffered()).toBe(0);
  expect(lane.inFlight()).toBe(0);
  expect(log).toEqual([]);
  expect(records).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

test("starting opens the adapter once and exposes its native handle", () => {
  const { lane, mock, log, records } = createLane();

  lane.start();
  lane.start();

  expect(log).toEqual(["open"]);
  expect(lane.status.get()).toEqual({ state: "ready" });
  expect(lane.native()).toBe(mock.sessions[0]);
  expect(records).toEqual([
    {
      source: "destination",
      type: "destination ready",
      destination: "product",
      event: null,
    },
  ]);
});

test("the status handed out is frozen and the same object until the lane moves, so observing it cannot prevent startup", () => {
  let attempts = 0;

  const { lane } = createLane({
    mock: {
      onOpen: () => {
        attempts += 1;

        if (attempts === 1) {
          throw new Error("the SDK is not initialized");
        }
      },
    },
  });

  const idle = lane.status.get();

  expect(lane.status.get()).toBe(idle);
  expect(Object.isFrozen(idle)).toBe(true);

  Reflect.set(idle, "state", "disposed");
  lane.start();

  const failed = lane.status.get();

  expect(lane.status.get()).toBe(failed);
  expect(Object.isFrozen(failed)).toBe(true);

  lane.start();

  expect(lane.status.get()).toEqual({ state: "ready" });
  expect(lane.status.get()).toBe(lane.status.get());
  expect(Object.isFrozen(lane.status.get())).toBe(true);
});

test("a start that throws leaves the lane failed with that error, keeps its buffer, and a later start retries", () => {
  const failure = new Error("the SDK is not initialized: token=abc");
  let attempts = 0;

  const { lane, mock, enqueue, outcomes, records } = createLane({
    mock: {
      onOpen: () => {
        attempts += 1;

        if (attempts === 1) {
          throw failure;
        }
      },
    },
  });

  enqueue("kept");
  lane.start();

  expect(lane.status.get()).toEqual({ state: "failed", error: failure });
  expect(lane.native()).toBeNull();
  expect(lane.buffered()).toBe(1);
  expect(outcomes.get("kept")).toEqual([]);
  expect(records).toStrictEqual([
    {
      source: "destination",
      type: "destination failed",
      destination: "product",
      event: null,
    },
  ]);
  expect(JSON.stringify(records)).not.toContain("token=abc");

  lane.start();

  expect(lane.status.get()).toEqual({ state: "ready" });
  expect(mock.sessions).toHaveLength(1);
  expect(outcomes.get("kept")).toEqual([SUBMITTED]);
});

test.each([
  ["nothing", undefined],
  ["null", null],
  ["a number", 7],
  ["an object without track", { native: null }],
  ["a track that is not a function", { native: null, track: "yes" }],
])(
  "an open that answers %s fails the start with TraceError INVALID_ANSWER",
  (_, answer) => {
    const { lane } = createLane({ adapter: answering(answer) });

    lane.start();

    const status = lane.status.get();
    const error = status.state === "failed" ? status.error : null;

    expect(status.state).toBe("failed");
    expect(error).toBeInstanceOf(TraceError);
    expect(error).toMatchObject({ code: "INVALID_ANSWER" });
  },
);

test("a promise answered by open fails the start with TraceError INVALID_ANSWER, and its rejection never reaches the host", async () => {
  const unhandled = vi.fn();

  process.on("unhandledRejection", unhandled);

  const { lane, log } = createLane({
    adapter: answering(Promise.reject(new Error("the SDK failed to load"))),
  });

  lane.start();
  await nextMacrotask();
  process.off("unhandledRejection", unhandled);

  const status = lane.status.get();

  expect(unhandled).not.toHaveBeenCalled();
  expect(status.state === "failed" ? status.error : null).toMatchObject({
    code: "INVALID_ANSWER",
  });
  expect(log).toEqual(["open"]);
});

test("native is read once, when the session opens", () => {
  let reads = 0;

  const { lane } = createLane({
    adapter: withSession((session) => ({
      ...session,
      get native() {
        reads += 1;

        return "sdk";
      },
    })),
  });

  lane.start();

  expect(lane.native()).toBe("sdk");
  expect(lane.native()).toBe("sdk");
  expect(reads).toBe(1);
});

test("a start made from inside an open that succeeds does nothing", () => {
  const { lane, mock, log } = createLane({
    mock: { onOpen: () => lane.start() },
  });

  lane.start();

  expect(log).toEqual(["open"]);
  expect(mock.sessions).toHaveLength(1);
  expect(lane.status.get()).toEqual({ state: "ready" });
});

test("a status subscriber that initializes the SDK on failure and starts again opens the lane on the retry", () => {
  vi.useFakeTimers();

  const sdk = { initialized: false, opens: 0 };

  const { lane, enqueue, outcomes } = createLane({
    maxAge: 1_000,
    mock: {
      onOpen: () => {
        sdk.opens += 1;

        if (!sdk.initialized) {
          throw new TraceError({
            code: "NOT_INITIALIZED",
            message: "The SDK is not initialized.",
          });
        }
      },
    },
  });

  enqueue("waiting");
  lane.status.subscribe(() => {
    if (lane.status.get().state === "failed" && !sdk.initialized) {
      sdk.initialized = true;
      lane.start();
    }
  });
  lane.start();

  expect(sdk.opens).toBe(2);
  expect(lane.status.get()).toEqual({ state: "ready" });
  expect(outcomes.get("waiting")).toEqual([SUBMITTED]);
  expect(vi.getTimerCount()).toBe(0);
});

test("a diagnostics listener that initializes the SDK on destination failed and starts again opens the lane on the retry", () => {
  const sdk = { initialized: false, opens: 0 };

  const { lane } = createLane({
    mock: {
      onOpen: () => {
        sdk.opens += 1;

        if (!sdk.initialized) {
          throw new TraceError({
            code: "NOT_INITIALIZED",
            message: "The SDK is not initialized.",
          });
        }
      },
    },
    onRecord: (record) => {
      if (record.type === "destination failed" && !sdk.initialized) {
        sdk.initialized = true;
        lane.start();
      }
    },
  });

  lane.start();

  expect(sdk.opens).toBe(2);
  expect(lane.status.get()).toEqual({ state: "ready" });
});

test("listeners that start again on every failure of an open that always throws cost exactly two attempts per call, and nothing throws", () => {
  let opens = 0;
  let retrying = true;

  const { lane, records } = createLane({
    mock: {
      onOpen: () => {
        opens += 1;

        throw new Error("the SDK is not initialized");
      },
    },
    onRecord: (record) => {
      if (retrying && record.type === "destination failed") {
        lane.start();
      }
    },
  });

  lane.status.subscribe(() => {
    if (retrying && lane.status.get().state === "failed") {
      lane.start();
    }
  });

  expect(() => lane.start()).not.toThrow();
  expect(opens).toBe(2);
  expect(lane.status.get().state).toBe("failed");
  expect(
    records.filter((record) => record.type === "destination failed"),
  ).toHaveLength(2);

  retrying = false;
  lane.start();

  expect(opens).toBe(3);
});

test("a start made from the ready notification does nothing", () => {
  let opens = 0;

  const { lane, log } = createLane({
    mock: {
      onOpen: () => {
        opens += 1;
      },
    },
  });

  lane.status.subscribe(() => {
    if (lane.status.get().state === "ready") {
      lane.start();
    }
  });
  lane.start();

  expect(opens).toBe(1);
  expect(log).toEqual(["open"]);
  expect(lane.status.get()).toEqual({ state: "ready" });
});

test("a start made from inside an open that throws retries once when that attempt ends", () => {
  let opens = 0;

  const { lane } = createLane({
    mock: {
      onOpen: () => {
        opens += 1;

        if (opens === 1) {
          lane.start();

          throw new Error("the SDK is not initialized");
        }
      },
    },
  });

  lane.start();

  expect(opens).toBe(2);
  expect(lane.status.get()).toEqual({ state: "ready" });
});

test("a lane disposed from inside open releases the new session at once and never uses it", () => {
  const { lane, mock, log, enqueue, outcomes } = createLane({
    identity: ADA,
    mock: { onOpen: () => lane.dispose() },
  });

  lane.start();
  enqueue("late");

  expect(log).toEqual(["open", "dispose"]);
  expect(mock.sessions[0]?.disposeCount).toBe(1);
  expect(outcomes.get("late")).toEqual([
    { status: "dropped", reason: "disposed" },
  ]);
  expect(lane.status.get()).toEqual({ state: "disposed" });
  expect(lane.native()).toBeNull();
});

test("a lane disposed from inside a failing open stays disposed", () => {
  const { lane, log } = createLane({
    mock: {
      onOpen: () => {
        lane.dispose();

        throw new Error("the SDK is not initialized");
      },
    },
  });

  lane.start();
  lane.start();

  expect(log).toEqual(["open"]);
  expect(lane.status.get()).toEqual({ state: "disposed" });
});

test("disposing from the ready notification releases the session before any buffered entry is handed off", () => {
  const { lane, log, enqueue, outcomes } = createLane();

  enqueue("buffered");
  lane.status.subscribe(() => {
    if (lane.status.get().state === "ready") {
      lane.dispose();
    }
  });
  lane.start();

  expect(log).toEqual(["open", "dispose"]);
  expect(outcomes.get("buffered")).toEqual([
    { status: "dropped", reason: "disposed" },
  ]);
});

test("entries accepted before the lane opens are handed off in acceptance order", () => {
  const { lane, log, enqueue, outcomes } = createLane();

  enqueue("first");
  enqueue("second");

  expect(lane.buffered()).toBe(2);
  expect(outcomes.get("first")).toEqual([]);

  lane.start();

  expect(log).toEqual(["open", "track first", "track second"]);
  expect(outcomes.get("first")).toEqual([SUBMITTED]);
  expect(outcomes.get("second")).toEqual([SUBMITTED]);
  expect(lane.buffered()).toBe(0);
});

test("an entry accepted from the ready notification joins the end instead of overtaking the buffered ones", () => {
  const { lane, log, enqueue } = createLane();

  enqueue("buffered");
  lane.status.subscribe(() => {
    if (lane.status.get().state === "ready") {
      enqueue("from-ready");
    }
  });
  lane.start();

  expect(log).toEqual(["open", "track buffered", "track from-ready"]);
});

test("a full buffer drops its oldest entry as buffer-overflow and records the overflow", () => {
  const { lane, enqueue, outcomes, records } = createLane({ capacity: 2 });

  enqueue("first");
  enqueue("second");
  enqueue("third");

  expect(outcomes.get("first")).toEqual([
    { status: "dropped", reason: "buffer-overflow" },
  ]);
  expect(outcomes.get("second")).toEqual([]);
  expect(lane.buffered()).toBe(2);
  expect(records).toEqual([
    {
      source: "destination",
      type: "buffer overflow",
      destination: "product",
      event: "first",
      context: { capacity: 2 },
    },
    {
      source: "event",
      type: "event dropped",
      destination: "product",
      event: "first",
      context: { reason: "buffer-overflow" },
    },
  ]);
});

test("a buffered entry that grows too old is dropped as buffer-expired, so its receipt can settle", () => {
  vi.useFakeTimers();

  const { enqueue, outcomes } = createLane({ maxAge: 1_000 });

  enqueue("old");
  vi.advanceTimersByTime(600);
  enqueue("young");
  vi.advanceTimersByTime(400);

  expect(outcomes.get("old")).toEqual([
    { status: "dropped", reason: "buffer-expired" },
  ]);
  expect(outcomes.get("young")).toEqual([]);

  vi.advanceTimersByTime(600);

  expect(outcomes.get("young")).toEqual([
    { status: "dropped", reason: "buffer-expired" },
  ]);
});

test("an entry that waits out a failed start is skipped as start-failed", () => {
  vi.useFakeTimers();

  const { lane, enqueue, outcomes } = createLane({
    maxAge: 1_000,
    mock: {
      onOpen: () => {
        throw new Error("the SDK is not initialized");
      },
    },
  });

  enqueue("stuck");
  lane.start();
  vi.advanceTimersByTime(1_000);

  expect(outcomes.get("stuck")).toEqual([
    { status: "skipped", reason: "start-failed" },
  ]);
});

test("a destination that never starts settles every receipt it took", () => {
  vi.useFakeTimers();

  const { lane, enqueue, outcomes } = createLane({
    capacity: 2,
    maxAge: 1_000,
  });

  enqueue("first");
  enqueue("second");
  enqueue("third");
  vi.advanceTimersByTime(1_000);

  expect([...outcomes.values()]).toEqual([
    [{ status: "dropped", reason: "buffer-overflow" }],
    [{ status: "dropped", reason: "buffer-expired" }],
    [{ status: "dropped", reason: "buffer-expired" }],
  ]);
  expect(lane.buffered()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

test("entries waiting behind an identity step are held in the same bounded buffer", () => {
  const step = createDeferred<void>();

  const { lane, enqueue, outcomes, setIdentity } = createLane({
    capacity: 1,
    mock: { onIdentity: () => step.promise },
  });

  lane.start();
  setIdentity(ADA);
  enqueue("preparing", ADA);
  enqueue("first-behind", ADA);
  enqueue("second-behind", ADA);

  expect(lane.buffered()).toBe(2);
  expect(outcomes.get("preparing")).toEqual([]);
  expect(outcomes.get("first-behind")).toEqual([
    { status: "dropped", reason: "buffer-overflow" },
  ]);
  expect(outcomes.get("second-behind")).toEqual([]);
});

test("a handoff passes the entry's event, an abort signal, the current generation and the lane's clock", () => {
  vi.useFakeTimers({ now: 5_000 });

  const { lane, mock, enqueue, entries, setIdentity } = createLane({
    mock: { hold: true },
  });

  lane.start();
  enqueue("event");
  setIdentity({ ...ADA, generation: 7 });

  const track = mock.tracks[0];

  expect(Object.keys(track?.context ?? {})).toEqual([
    "signal",
    "currentGeneration",
    "now",
  ]);
  expect(track?.event).toBe(entries.get("event")?.event);
  expect(track?.context.signal).toBeInstanceOf(AbortSignal);
  expect(track?.context.signal.aborted).toBe(false);
  expect(track?.context.currentGeneration()).toBe(7);
  expect(track?.context.now()).toBe(5_000);

  vi.setSystemTime(6_000);

  expect(track?.context.now()).toBe(6_000);
  expect(lane.inFlight()).toBe(1);
  expect(lane.buffered()).toBe(0);
});

test("a held handoff lands with what the provider answers, the event's losses before the adapter's", async () => {
  const { lane, mock, enqueue, outcomes, landed } = createLane({
    mock: { hold: true },
  });

  lane.start();
  enqueue("event", undefined, [
    { path: "properties.card", reason: "redacted" },
  ]);
  mock.tracks[0]?.settle({
    status: "submitted",
    evidence: "sdk-callback-completed",
    event: { id: "provider-1" },
    losses: [{ path: "timestamp", reason: "unsupported" }],
  });
  await landed("event");

  expect(outcomes.get("event")).toEqual([
    {
      status: "submitted",
      evidence: "sdk-callback-completed",
      event: { id: "provider-1" },
      losses: [
        { path: "properties.card", reason: "redacted" },
        { path: "timestamp", reason: "unsupported" },
      ],
    },
  ]);
  expect(lane.inFlight()).toBe(0);
});

test("a handoff that throws settles failed and blocks nothing behind it", () => {
  const thrown = new Error("the SDK threw");
  let poisoned = true;

  const { lane, enqueue, outcomes } = createLane({
    mock: {
      onTrack: () => {
        if (poisoned) {
          poisoned = false;

          throw thrown;
        }
      },
    },
  });

  lane.start();
  enqueue("poison");
  enqueue("behind");

  expect(outcomes.get("poison")).toEqual([{ status: "failed", error: thrown }]);
  expect(outcomes.get("behind")).toEqual([SUBMITTED]);
  expect(lane.status.get()).toEqual({ state: "ready" });
  expect(lane.inFlight()).toBe(0);
});

test("a handoff that rejects settles failed and blocks nothing behind it", async () => {
  const rejection = new Error("network down");

  const { lane, mock, enqueue, outcomes, landed } = createLane({
    mock: { hold: true },
  });

  lane.start();
  enqueue("rejected");
  enqueue("behind");
  mock.tracks[0]?.fail(rejection);
  mock.tracks[1]?.settle();
  await Promise.all([landed("rejected"), landed("behind")]);

  expect(outcomes.get("rejected")).toEqual([
    { status: "failed", error: rejection },
  ]);
  expect(outcomes.get("behind")).toEqual([SUBMITTED]);
});

test("a lane disposed from its owner's change notice before a handoff never calls track", () => {
  const { lane, log, enqueue, outcomes } = createLane({
    onChanged: () => {
      if (lane.inFlight() === 1) {
        lane.dispose();
      }
    },
  });

  lane.start();
  enqueue("event");

  expect(log).toEqual(["open", "dispose"]);
  expect(outcomes.get("event")).toEqual([
    { status: "indeterminate", reason: "disposed" },
  ]);
});

test("a track that never answers never blocks the entry behind it", () => {
  const { lane, log, enqueue } = createLane({ mock: { hold: true } });

  lane.start();
  enqueue("slow");
  enqueue("behind");

  expect(log).toEqual(["open", "track slow", "track behind"]);
  expect(lane.inFlight()).toBe(2);
});

test("a hanging handoff is indeterminate at its deadline with its signal aborted, and a late answer after the deadline is ignored", async () => {
  vi.useFakeTimers();

  const { lane, mock, enqueue, outcomes } = createLane({
    timeout: 5_000,
    mock: { hold: true },
  });

  lane.start();
  enqueue("slow");
  enqueue("late-failure");
  vi.advanceTimersByTime(4_999);

  expect(outcomes.get("slow")).toEqual([]);

  vi.advanceTimersByTime(1);

  expect(outcomes.get("slow")).toEqual([
    { status: "indeterminate", reason: "timeout" },
  ]);
  expect(mock.tracks[0]?.context.signal.aborted).toBe(true);
  expect(lane.inFlight()).toBe(0);

  mock.tracks[0]?.settle();
  mock.tracks[1]?.fail(new Error("answered after the deadline"));
  await vi.advanceTimersByTimeAsync(0);

  expect(outcomes.get("slow")).toEqual([
    { status: "indeterminate", reason: "timeout" },
  ]);
  expect(outcomes.get("late-failure")).toEqual([
    { status: "indeterminate", reason: "timeout" },
  ]);
});

test("an answer outside the contract settles failed with TraceError INVALID_ANSWER", () => {
  const { lane, enqueue, outcomes } = createLane({
    // @ts-expect-error A JavaScript adapter can answer a status the contract does not know.
    mock: { onTrack: () => ({ status: "delivered" }) },
  });

  lane.start();
  enqueue("event");

  const outcome = outcomes.get("event")?.[0];

  expect(outcome?.status).toBe("failed");
  expect(outcome?.status === "failed" ? outcome.error : null).toMatchObject({
    code: "INVALID_ANSWER",
  });
});

test("an answer whose then cannot be read settles failed instead of throwing into the caller", () => {
  const thrown = new Error("then exploded");

  const { lane, enqueue, outcomes } = createLane({
    mock: {
      // @ts-expect-error A JavaScript adapter can answer an object whose then throws.
      onTrack: () => ({
        get then() {
          throw thrown;
        },
      }),
    },
  });

  lane.start();

  expect(() => enqueue("event")).not.toThrow();
  expect(outcomes.get("event")).toEqual([{ status: "failed", error: thrown }]);
});

test("flush answers not-ready before the lane opens", async () => {
  const { lane, enqueue } = createLane();

  enqueue("waiting");

  await expect(lane.flush({ timeout: 100 })).resolves.toEqual({
    status: "not-ready",
  });
});

test("flush waits for what was accepted before it to be handed off, then gives the provider's flush the time left and a signal", async () => {
  vi.useFakeTimers();

  const step = createDeferred<void>();

  const { lane, mock, log, enqueue, setIdentity } = createLane({
    mock: { onIdentity: () => step.promise },
  });

  lane.start();
  setIdentity(ADA);
  enqueue("waiting", ADA);

  const flushed = lane.flush({ timeout: 1_000 });

  await vi.advanceTimersByTimeAsync(300);

  expect(log).toEqual(["open", "identify ada"]);

  step.resolve();
  await vi.advanceTimersByTimeAsync(0);

  await expect(flushed).resolves.toEqual({ status: "flushed" });
  expect(log).toEqual(["open", "identify ada", "track waiting", "flush"]);
  expect(mock.sessions[0]?.flushes[0]?.context.timeout).toBe(700);
  expect(mock.sessions[0]?.flushes[0]?.context.signal.aborted).toBe(false);
});

test("a lane disposed while a flush waits answers not-ready and never calls the provider's flush", async () => {
  const step = createDeferred<void>();

  const { lane, log, enqueue, outcomes, setIdentity } = createLane({
    mock: { onIdentity: () => step.promise },
  });

  lane.start();
  setIdentity(ADA);
  enqueue("waiting", ADA);

  const flushed = lane.flush({ timeout: 1_000 });

  lane.dispose();

  await expect(flushed).resolves.toEqual({ status: "not-ready" });
  expect(outcomes.get("waiting")).toEqual([
    { status: "dropped", reason: "disposed" },
  ]);
  expect(log).toEqual(["open", "identify ada", "dispose"]);
});

test("a flush waiting for the provider's answer when the lane is disposed answers not-ready at once and clears its timer", async () => {
  vi.useFakeTimers();

  const { lane, mock } = createLane({ mock: { flush: "hold" } });

  lane.start();

  const answers: unknown[] = [];

  const flushed = lane
    .flush({ timeout: 60_000 })
    .then((result) => answers.push(result));

  await vi.advanceTimersByTimeAsync(0);

  expect(mock.sessions[0]?.flushes).toHaveLength(1);

  lane.dispose();

  expect(vi.getTimerCount()).toBe(0);

  await vi.advanceTimersByTimeAsync(0);

  expect(answers).toEqual([{ status: "not-ready" }]);
  expect(mock.sessions[0]?.flushes[0]?.context.signal.aborted).toBe(true);

  await flushed;
});

test("a lane disposed after a flush's wait ended and before the flush goes on answers not-ready and never calls the provider's flush", async () => {
  const { lane, log } = createLane();

  lane.start();

  const flushed = lane.flush({ timeout: 1_000 });

  queueMicrotask(() => lane.dispose());

  await expect(flushed).resolves.toEqual({ status: "not-ready" });
  expect(log).toEqual(["open", "dispose"]);
});

test("flush waits for the identity pass running at the call before it calls the provider's flush", async () => {
  const step = createDeferred<void>();

  const { lane, log, setIdentity } = createLane({
    mock: { onIdentity: () => step.promise },
  });

  lane.start();
  setIdentity(ADA);
  lane.identityChanged();

  const answers: unknown[] = [];

  const flushed = lane
    .flush({ timeout: 1_000 })
    .then((result) => answers.push(result));

  await nextMacrotask();

  expect(answers).toEqual([]);
  expect(log).toEqual(["open", "identify ada"]);

  step.resolve();
  await flushed;

  expect(answers).toEqual([{ status: "flushed" }]);
  expect(log).toEqual(["open", "identify ada", "flush"]);
});

test("flush waits for an identity pass requested behind an entry at the call, and not for one requested after it", async () => {
  const identify = createDeferred<void>();
  const traits = createDeferred<void>();

  const { lane, log, enqueue, setIdentity } = createLane({
    mock: {
      onIdentity: (call) => {
        if (call.kind === "identify") {
          return identify.promise;
        }

        if (call.kind === "traits") {
          return traits.promise;
        }

        return new Promise<void>(() => {});
      },
    },
  });

  lane.start();
  setIdentity(ADA);
  enqueue("waiting", ADA);
  setIdentity(ADA_PRO);
  lane.identityChanged();

  const answers: unknown[] = [];

  const flushed = lane
    .flush({ timeout: 1_000 })
    .then((result) => answers.push(result));

  identify.resolve();
  await nextMacrotask();

  expect(answers).toEqual([]);
  expect(log).toEqual(["open", "identify ada", "track waiting", "traits"]);

  setIdentity({ ...ADA_PRO, groups: { workspace: { id: "w_1", traits: {} } } });
  lane.identityChanged();
  traits.resolve();
  await flushed;

  expect(answers).toEqual([{ status: "flushed" }]);
  expect(log).toEqual([
    "open",
    "identify ada",
    "track waiting",
    "traits",
    "group workspace",
    "flush",
  ]);
});

test("a flush whose identity pass never settles answers timeout without calling the provider's flush", async () => {
  vi.useFakeTimers();

  const { lane, log, setIdentity } = createLane({
    mock: { onIdentity: () => new Promise<void>(() => {}) },
  });

  lane.start();
  setIdentity(ADA);
  lane.identityChanged();

  const flushed = lane.flush({ timeout: 200 });

  await vi.advanceTimersByTimeAsync(200);

  await expect(flushed).resolves.toEqual({ status: "timeout" });
  expect(log).toEqual(["open", "identify ada"]);
});

test("an identity pass the lane discards because consent closed ends the flush's wait for it", async () => {
  const step = createDeferred<void>();

  const { lane, log, enqueue, setConsentSilently, setIdentity } = createLane({
    mock: { onIdentity: () => step.promise },
  });

  lane.start();
  setIdentity(ADA);
  enqueue("waiting", ADA);
  setIdentity(ADA_PRO);
  lane.identityChanged();

  const flushed = lane.flush({ timeout: 1_000 });

  setConsentSilently(false);
  step.resolve();

  await expect(flushed).resolves.toEqual({ status: "flushed" });
  expect(log).toEqual(["open", "identify ada", "flush"]);
});

test("disposal settles the identity step it waits on and leaves no timer behind", () => {
  vi.useFakeTimers();

  const { lane, enqueue, outcomes, setIdentity } = createLane({
    mock: { onIdentity: () => new Promise<void>(() => {}) },
  });

  lane.start();
  setIdentity(ADA);
  enqueue("waiting", ADA);

  expect(vi.getTimerCount()).toBe(1);

  lane.dispose();

  expect(vi.getTimerCount()).toBe(0);
  expect(outcomes.get("waiting")).toEqual([
    { status: "dropped", reason: "disposed" },
  ]);
});

test("flush waits for work accepted before the call and not for work accepted after", async () => {
  const { lane, mock, enqueue } = createLane({ mock: { hold: true } });

  lane.start();
  enqueue("before");

  const flushed = lane.flush({ timeout: 1_000 });

  enqueue("after");
  mock.tracks[0]?.settle();

  await expect(flushed).resolves.toEqual({ status: "flushed" });
  expect(lane.inFlight()).toBe(1);
  expect(mock.sessions[0]?.flushes).toHaveLength(1);
});

test("flush answers unsupported for a session without flush, once the handoffs before it answered", async () => {
  const { lane, mock, enqueue } = createLane({
    mock: { hold: true, flush: false },
  });

  lane.start();
  enqueue("before");

  const answers: unknown[] = [];

  const flushed = lane
    .flush({ timeout: 1_000 })
    .then((result) => answers.push(result));

  await nextMacrotask();

  expect(answers).toEqual([]);

  mock.tracks[0]?.settle();
  await flushed;

  expect(answers).toEqual([{ status: "unsupported" }]);
});

test("a flush that runs out of time answers timeout and aborts the provider's signal", async () => {
  vi.useFakeTimers();

  const { lane, mock } = createLane({ mock: { flush: "hold" } });

  lane.start();

  const flushed = lane.flush({ timeout: 200 });

  await vi.advanceTimersByTimeAsync(200);

  await expect(flushed).resolves.toEqual({ status: "timeout" });
  expect(mock.sessions[0]?.flushes[0]?.context.signal.aborted).toBe(true);
});

test("a flush whose boundary is never handed off answers timeout without calling the provider's flush", async () => {
  vi.useFakeTimers();

  const { lane, log, enqueue, setIdentity } = createLane({
    mock: { onIdentity: () => new Promise(() => {}) },
  });

  lane.start();
  setIdentity(ADA);
  enqueue("stuck", ADA);

  const flushed = lane.flush({ timeout: 200 });

  await vi.advanceTimersByTimeAsync(200);

  await expect(flushed).resolves.toEqual({ status: "timeout" });
  expect(log).toEqual(["open", "identify ada"]);
});

test.each(
  [
    {
      label: "throws",
      flush: (failure: Error) => () => {
        throw failure;
      },
    },
    {
      label: "rejects",
      flush: (failure: Error) => () => Promise.reject(failure),
    },
  ].map((row): [string, typeof row] => [row.label, row]),
)(
  "a provider flush that %s answers failed with that error",
  async (_, { flush }) => {
    const failure = new Error("the flush broke");

    const { lane } = createLane({
      adapter: withSession((session) => ({
        ...session,
        flush: flush(failure),
      })),
    });

    lane.start();

    await expect(lane.flush({ timeout: 1_000 })).resolves.toEqual({
      status: "failed",
      error: failure,
    });
  },
);

test.each(["then", "constructor"])(
  "a provider flush that answers a promise whose %s cannot be read answers failed",
  async (read) => {
    const { lane } = createLane({
      adapter: withSession((session) => ({
        ...session,
        flush: () => createHostilePromise(read, { status: "flushed" }),
      })),
    });

    lane.start();

    const result = await lane.flush({ timeout: 1_000 });

    expect(result.status).toBe("failed");
    expect(result.status === "failed" ? result.error : null).toMatchObject({
      message: `reading ${read} threw`,
    });
  },
);

test("a provider flush that answers outside the contract answers failed with TraceError INVALID_ANSWER", async () => {
  const { lane } = createLane({
    adapter: withSession((session) => ({
      ...session,
      // @ts-expect-error A JavaScript adapter can answer a status the contract does not know.
      flush: () => ({ status: "done" }),
    })),
  });

  lane.start();

  const result = await lane.flush({ timeout: 1_000 });

  expect(result.status).toBe("failed");
  expect(result.status === "failed" ? result.error : null).toMatchObject({
    code: "INVALID_ANSWER",
  });
});

test("the flush timer is the only referenced timer", async () => {
  const scheduled = vi.spyOn(globalThis, "setTimeout");

  const { lane, enqueue, setIdentity } = createLane({
    maxAge: 60_000,
    timeout: 5_000,
    now: () => 1_000,
    mock: { hold: true, onIdentity: () => new Promise(() => {}) },
  });

  enqueue("buffered");
  lane.start();
  setIdentity(ADA);
  enqueue("preparing", ADA);
  enqueue("behind", ADA);

  const flushed = lane.flush({ timeout: 1_234 });

  const referenced = scheduled.mock.calls.flatMap((call, index) => {
    const result = scheduled.mock.results[index];

    if (result?.type !== "return" || !result.value.hasRef()) {
      return [];
    }

    return [call];
  });

  expect(scheduled.mock.calls.map(([, delay]) => delay)).toEqual([
    60_000, 5_000, 5_000, 60_000, 1_234,
  ]);
  expect(referenced.map(([, delay]) => delay)).toEqual([1_234]);

  lane.dispose();

  await expect(flushed).resolves.toEqual({ status: "not-ready" });
});

test("disposal settles everything it holds and refuses what comes later", async () => {
  const { lane, mock, log, enqueue, outcomes, records } = createLane({
    mock: { hold: true },
  });

  const idle = createLane();

  lane.start();
  enqueue("in-flight");
  idle.enqueue("buffered");

  lane.dispose();
  lane.dispose();
  idle.lane.dispose();
  enqueue("late");

  expect(outcomes.get("in-flight")).toEqual([
    { status: "indeterminate", reason: "disposed" },
  ]);
  expect(idle.outcomes.get("buffered")).toEqual([
    { status: "dropped", reason: "disposed" },
  ]);
  expect(outcomes.get("late")).toEqual([
    { status: "dropped", reason: "disposed" },
  ]);
  expect(mock.tracks[0]?.context.signal.aborted).toBe(true);
  expect(mock.sessions[0]?.disposeCount).toBe(1);
  expect(log).toEqual(["open", "track in-flight", "dispose"]);
  expect(lane.status.get()).toEqual({ state: "disposed" });
  expect(lane.native()).toBeNull();
  expect(lane.buffered()).toBe(0);
  expect(lane.inFlight()).toBe(0);
  expect(
    records.filter((record) => record.type === "destination disposed"),
  ).toHaveLength(1);

  mock.tracks[0]?.settle();
  await nextMacrotask();

  expect(outcomes.get("in-flight")).toHaveLength(1);
});

test("nothing is called on a session after its lane is disposed", async () => {
  const { lane, log, enqueue, setConsent, setIdentity } = createLane();

  lane.start();
  lane.dispose();
  lane.start();
  setIdentity(ADA);
  lane.identityChanged();
  setConsent(false);
  setConsent(true);
  lane.dropBefore(5)();
  enqueue("late", ADA);

  await expect(lane.flush({ timeout: 100 })).resolves.toEqual({
    status: "not-ready",
  });
  expect(log).toEqual(["open", "dispose"]);
});

test.each(
  [
    {
      label: "throws",
      dispose: () => {
        throw new Error("close threw");
      },
    },
    {
      label: "rejects",
      dispose: () => Promise.reject(new Error("close rejected")),
    },
  ].map((row): [string, typeof row] => [row.label, row]),
)(
  "a session whose disposal %s cannot break the host, and the failure is recorded without the error",
  async (_, { dispose }) => {
    const unhandled = vi.fn();

    process.on("unhandledRejection", unhandled);

    const { lane, log, records } = createLane({
      adapter: withSession((session) => ({ ...session, dispose })),
    });

    lane.start();

    expect(() => lane.dispose()).not.toThrow();

    await nextMacrotask();
    process.off("unhandledRejection", unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    expect(lane.status.get()).toEqual({ state: "disposed" });
    expect(log).toEqual(["open", "dispose"]);
    expect(
      records.filter((record) => record.type === "destination dispose failed"),
    ).toStrictEqual([
      {
        source: "destination",
        type: "destination dispose failed",
        destination: "product",
        event: null,
      },
    ]);
    expect(JSON.stringify(records)).not.toContain("close");
  },
);

test.each(["then", "constructor"])(
  "a session whose disposal answers a promise whose %s cannot be read cannot break the host",
  async (read) => {
    const unhandled = vi.fn();

    process.on("unhandledRejection", unhandled);

    const { lane, records } = createLane({
      adapter: withSession((session) => ({
        ...session,
        dispose: () => createHostilePromise(read, undefined),
      })),
    });

    lane.start();

    expect(() => lane.dispose()).not.toThrow();

    await nextMacrotask();
    process.off("unhandledRejection", unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    expect(
      records.filter((record) => record.type === "destination dispose failed"),
    ).toHaveLength(1);
  },
);

test("the lane's own asynchronous work never rejects: every hostile answer ends as an outcome or a diagnostic, and each entry lands once", async () => {
  const unhandled = vi.fn();

  const answers: (() => unknown)[] = [
    () => {
      throw new Error("track threw");
    },
    () => Promise.reject(new Error("track rejected")),
    () => ({ status: "delivered" }),
    () => ({
      get then() {
        throw new Error("then exploded");
      },
    }),
    () => createHostilePromise("constructor", { status: "submitted" }),
    () => new Promise(() => {}),
  ];

  process.on("unhandledRejection", unhandled);

  const { lane, enqueue, outcomes, setConsent, setIdentity } = createLane({
    gated: true,
    adapter: withSession((session) => ({
      ...session,
      // @ts-expect-error A JavaScript adapter can answer anything from track.
      track: (tracked) => answers[Number(tracked.id)]?.(),
      identify: () => Promise.reject(new Error("identify rejected")),
      traits: () => {
        throw new Error("traits threw");
      },
      reset: () => createHostilePromise("then", undefined),
      collection: () => Promise.reject(new Error("collection rejected")),
      flush: () => createHostilePromise("then", { status: "flushed" }),
      dispose: () => Promise.reject(new Error("dispose rejected")),
    })),
  });

  lane.start();

  for (const id of ["0", "1", "2", "3", "4", "5"]) {
    enqueue(id);
  }

  setIdentity(ADA);
  enqueue("ada", ADA);
  setConsent(false);
  setConsent(true);
  enqueue("again", ADA);

  const flushed = lane.flush({ timeout: 1_000 });

  await nextMacrotask();
  lane.dispose();
  await flushed;
  await nextMacrotask();
  process.off("unhandledRejection", unhandled);

  expect(unhandled.mock.calls).toEqual([]);
  expect(
    ["0", "1", "2", "3", "4", "5", "ada", "again"].map(
      (id) => outcomes.get(id)?.length,
    ),
  ).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
});

test("every call into adapter code runs inside depth, and depth is left even when the call throws", async () => {
  const { lane, log, depths, level, enqueue, setConsent, setIdentity } =
    createLane({
      gated: true,
      mock: {
        onTrack: (track) => {
          if (track.event.id === "throws") {
            throw new Error("the SDK threw");
          }
        },
      },
    });

  lane.start();
  setIdentity({
    generation: 1,
    user: { id: "ada" },
    traits: { plan: "pro" },
    groups: { workspace: { id: "w_1", traits: {} } },
  });
  enqueue("identified");
  enqueue("throws");
  setIdentity({ ...ADA, generation: 2, user: { id: "bob" } });
  enqueue("switched");
  setConsent(false);
  await lane.flush({ timeout: 100 });
  lane.dispose();

  expect(log).toEqual([
    "open",
    "collection true",
    "identify ada",
    "traits",
    "group workspace",
    "track identified",
    "track throws",
    "reset",
    "identify bob",
    "track switched",
    "collection false",
    "flush",
    "dispose",
  ]);
  expect(depths).toEqual(log.map(() => 1));
  expect(level()).toBe(0);
});

test("the lane tells its owner every time what it holds or its status changes", async () => {
  const step = createDeferred<void>();

  const { lane, mock, enqueue, changes, setIdentity } = createLane({
    mock: { hold: true, onIdentity: () => step.promise },
  });

  enqueue("event");
  lane.start();
  mock.tracks[0]?.settle();
  await nextMacrotask();
  setIdentity(ADA);
  enqueue("waiting", ADA);
  step.resolve();
  await nextMacrotask();
  mock.tracks[1]?.settle();
  await nextMacrotask();
  lane.dispose();

  expect(changes).toEqual([
    { buffered: 1, inFlight: 0, state: "idle" },
    { buffered: 1, inFlight: 0, state: "ready" },
    { buffered: 0, inFlight: 1, state: "ready" },
    { buffered: 0, inFlight: 0, state: "ready" },
    { buffered: 1, inFlight: 0, state: "ready" },
    { buffered: 0, inFlight: 1, state: "ready" },
    { buffered: 0, inFlight: 0, state: "ready" },
    { buffered: 0, inFlight: 0, state: "disposed" },
  ]);
});

test("every landing is recorded with its destination and event and plain data only", async () => {
  const secret = new Error("request failed: Authorization: Bearer abc");

  const { lane, enqueue, records } = createLane({
    mock: {
      onTrack: (track) => {
        if (track.event.id === "failed") {
          throw secret;
        }

        if (track.event.id === "filtered") {
          return {
            status: "dropped",
            reason: "provider-filtered",
            losses: [{ path: "properties.plan", reason: "omitted" }],
          };
        }

        if (track.event.id === "skipped") {
          return { status: "skipped", reason: "unsupported" };
        }

        if (track.event.id === "ambiguous") {
          return { status: "indeterminate", reason: "ambiguous" };
        }
      },
    },
  });

  lane.start();
  enqueue("submitted", undefined, [
    { path: "context.token", reason: "redacted" },
  ]);
  enqueue("failed");
  enqueue("filtered");
  enqueue("skipped");
  enqueue("ambiguous");

  expect(records.filter((record) => record.source === "event")).toStrictEqual([
    {
      source: "event",
      type: "event submitted",
      destination: "product",
      event: "submitted",
      context: {
        evidence: "sdk-call-returned",
        losses: [{ path: "context.token", reason: "redacted" }],
      },
    },
    {
      source: "event",
      type: "event failed",
      destination: "product",
      event: "failed",
    },
    {
      source: "event",
      type: "event dropped",
      destination: "product",
      event: "filtered",
      context: {
        reason: "provider-filtered",
        losses: [{ path: "properties.plan", reason: "omitted" }],
      },
    },
    {
      source: "event",
      type: "event skipped",
      destination: "product",
      event: "skipped",
      context: { reason: "unsupported" },
    },
    {
      source: "event",
      type: "event indeterminate",
      destination: "product",
      event: "ambiguous",
      context: { reason: "ambiguous" },
    },
  ]);
  expect(JSON.stringify(records)).not.toContain("Bearer");
});

test("members stay bound when passed around", () => {
  const { lane } = createLane();
  const { start, status, native } = lane;

  start();

  expect(status.get()).toEqual({ state: "ready" });
  expect(native()).not.toBeNull();
});
