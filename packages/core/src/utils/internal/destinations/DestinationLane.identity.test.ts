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

const ANONYMOUS: IdentityTarget = {
  generation: 0,
  user: null,
  traits: {},
  groups: {},
};

const ADA: IdentityTarget = {
  generation: 1,
  user: { id: "ada" },
  traits: {},
  groups: {},
};

const ADA_PRO: IdentityTarget = { ...ADA, traits: { plan: "pro" } };

const BOB: IdentityTarget = {
  generation: 2,
  user: { id: "bob" },
  traits: {},
  groups: {},
};

const SIGNED_OUT: IdentityTarget = {
  generation: 2,
  user: null,
  traits: {},
  groups: {},
};

const createHostilePromise = (read: string) => {
  const promise = Promise.resolve();

  Object.defineProperty(promise, read, {
    get() {
      throw new Error(`reading ${read} threw`);
    },
  });

  return promise;
};

const SUBMITTED: DestinationOutcome = {
  status: "submitted",
  evidence: "sdk-call-returned",
  event: null,
  losses: [],
};

const IDENTITY_FAILED: DestinationOutcome = {
  status: "skipped",
  reason: "identity-failed",
};

test("the identity a queued entry carries is applied before that entry is handed off", () => {
  const { lane, log, enqueue, setIdentity } = createLane();

  enqueue("ada-event", ADA);
  setIdentity(BOB);
  enqueue("bob-event", BOB);
  lane.start();

  expect(log).toEqual([
    "open",
    "identify ada",
    "track ada-event",
    "reset",
    "identify bob",
    "track bob-event",
  ]);
});

test("a fresh session is seeded blank at the generation the lane was built at, so an anonymous history is kept and nothing is reset", () => {
  const { lane, log, enqueue, setIdentity } = createLane();

  enqueue("anonymous", ANONYMOUS);
  setIdentity(ADA);
  lane.start();

  expect(log).toEqual(["open", "track anonymous", "identify ada"]);
});

test("a fresh session opened for a signed-in user is identified without a reset, with exactly the updates the plan made", () => {
  const { lane, mock } = createLane({
    identity: {
      generation: 3,
      user: { id: "ada" },
      traits: { plan: "pro", role: null },
      groups: { workspace: { id: "w_1", traits: { seats: 3 } }, team: null },
    },
  });

  lane.start();

  expect(mock.sessions[0]?.identity).toEqual([
    { kind: "identify", user: { id: "ada" } },
    {
      kind: "traits",
      user: { id: "ada" },
      set: { plan: "pro" },
      remove: ["role"],
    },
    {
      kind: "group",
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: { seats: 3 } },
    },
    {
      kind: "group",
      user: { id: "ada" },
      group: { type: "team", id: null, traits: {} },
    },
  ]);
});

test.each(
  [
    {
      label: "a plain load, anonymous at 0, never resets",
      targets: [],
      log: ["open"],
    },
    {
      label: "one restored sign-in, a user at 1, never resets",
      targets: [ADA],
      log: ["open", "identify ada"],
    },
    {
      label: "a sign-out made before the lane opens resets once at open",
      targets: [ADA, SIGNED_OUT],
      log: ["open", "reset"],
    },
    {
      label: "a switch made before the lane opens resets and then identifies",
      targets: [ADA, BOB],
      log: ["open", "reset", "identify bob"],
    },
  ].map((row): [string, typeof row] => [row.label, row]),
)("%s", (_, { targets, log: expected }) => {
  const { lane, log, setIdentity } = createLane();

  for (const target of targets) {
    setIdentity(target);
    lane.identityChanged();
  }

  lane.start();

  expect(log).toEqual(expected);
});

test("a retry after a failed open is seeded at the generation the lane was built at", () => {
  let attempts = 0;

  const { lane, log, setIdentity } = createLane({
    mock: {
      onOpen: () => {
        attempts += 1;

        if (attempts === 1) {
          throw new Error("the SDK is not initialized");
        }
      },
    },
  });

  lane.start();
  setIdentity(ADA);
  lane.identityChanged();
  setIdentity(BOB);
  lane.dropBefore(2)();
  lane.identityChanged();
  lane.start();

  expect(log).toEqual(["open", "open", "reset", "identify bob"]);
});

test("an identity change before the lane opens is planned when it opens", () => {
  const { lane, log, setIdentity } = createLane();

  setIdentity(ADA);
  lane.identityChanged();

  expect(log).toEqual([]);

  lane.start();

  expect(log).toEqual(["open", "identify ada"]);
});

test("a session without identity methods gets no steps, and each event carries its identity", () => {
  const { lane, mock, log, enqueue } = createLane({
    identity: ADA,
    mock: { identity: false },
  });

  lane.start();
  enqueue("event");

  expect(log).toEqual(["open", "track event"]);
  expect(mock.tracks[0]?.event.identity.user).toEqual({ id: "ada" });
});

test("a slow identity step holds later handoffs but not earlier ones", async () => {
  const step = createDeferred<void>();

  const { lane, mock, log, enqueue, outcomes, landed, setIdentity } =
    createLane({ mock: { hold: true, onIdentity: () => step.promise } });

  lane.start();
  enqueue("earlier");
  setIdentity(ADA);
  enqueue("waiting", ADA);
  enqueue("later", ADA);

  expect(log).toEqual(["open", "track earlier", "identify ada"]);

  mock.tracks[0]?.settle();
  await landed("earlier");

  expect(outcomes.get("earlier")).toEqual([SUBMITTED]);
  expect(outcomes.get("waiting")).toEqual([]);
  expect(lane.buffered()).toBe(2);

  step.resolve();
  await nextMacrotask();

  expect(log).toEqual([
    "open",
    "track earlier",
    "identify ada",
    "track waiting",
    "track later",
  ]);
});

test.each(
  [
    { label: "throws", reason: "error" },
    { label: "rejects", reason: "error" },
    { label: "passes its deadline", reason: "timeout" },
  ].map((row): [string, typeof row] => [row.label, row]),
)(
  "an identity step that %s skips its entry as identity-failed, and the next entry plans again from an unknown state",
  async (_, { label, reason }) => {
    vi.useFakeTimers();

    let calls = 0;

    const { lane, log, enqueue, outcomes, records, setIdentity } = createLane({
      timeout: 1_000,
      mock: {
        onIdentity: () => {
          calls += 1;

          if (calls > 1) {
            return;
          }

          if (label === "throws") {
            throw new Error("the SDK refused");
          }

          if (label === "rejects") {
            return Promise.reject(new Error("the SDK refused"));
          }

          return new Promise<void>(() => {});
        },
      },
    });

    lane.start();
    setIdentity(ADA);
    enqueue("first", ADA);
    enqueue("second", ADA);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(outcomes.get("first")).toEqual([IDENTITY_FAILED]);
    expect(outcomes.get("second")).toEqual([SUBMITTED]);
    expect(log).toEqual([
      "open",
      "identify ada",
      "reset",
      "identify ada",
      "track second",
    ]);
    expect(records.filter((record) => record.source === "identity")).toEqual([
      {
        source: "identity",
        type: "identity step failed",
        destination: "product",
        event: "first",
        context: { step: "identify", reason },
      },
    ]);
  },
);

test("a stale identity step that answers after its deadline changes nothing for the pass that replaced it", async () => {
  vi.useFakeTimers();

  const stale = createDeferred<void>();
  let calls = 0;

  const { lane, log, enqueue, outcomes, setIdentity } = createLane({
    timeout: 1_000,
    mock: {
      onIdentity: () => {
        calls += 1;

        if (calls === 1) {
          return stale.promise;
        }
      },
    },
  });

  lane.start();
  setIdentity(ADA_PRO);
  enqueue("first", ADA_PRO);
  enqueue("second", ADA_PRO);
  await vi.advanceTimersByTimeAsync(1_000);

  const recovered = [
    "open",
    "identify ada",
    "reset",
    "identify ada",
    "traits",
    "track second",
  ];

  expect(log).toEqual(recovered);

  stale.resolve();
  await vi.advanceTimersByTimeAsync(0);
  enqueue("third", ADA_PRO);

  expect(log).toEqual([...recovered, "track third"]);
  expect(outcomes.get("first")).toEqual([IDENTITY_FAILED]);
  expect(outcomes.get("third")).toEqual([SUBMITTED]);
});

test.each(["identify", "traits", "group"])(
  "%s throwing TraceError UNSUPPORTED is recorded as unsupported and counted as done",
  (kind) => {
    const target: IdentityTarget = {
      generation: 1,
      user: { id: "ada" },
      traits: { plan: "pro" },
      groups: { workspace: { id: "w_1", traits: {} } },
    };

    const { lane, log, enqueue, outcomes, records, setIdentity } = createLane({
      mock: {
        onIdentity: (call) => {
          if (call.kind === kind) {
            throw new TraceError({
              code: "UNSUPPORTED",
              message: "This SDK cannot take that update.",
            });
          }
        },
      },
    });

    lane.start();
    setIdentity(target);
    enqueue("first", target);
    enqueue("second", target);

    expect(outcomes.get("first")).toEqual([SUBMITTED]);
    expect(outcomes.get("second")).toEqual([SUBMITTED]);
    expect(log).toEqual([
      "open",
      "identify ada",
      "traits",
      "group workspace",
      "track first",
      "track second",
    ]);
    expect(records.filter((record) => record.source === "identity")).toEqual([
      {
        source: "identity",
        type: "identity step unsupported",
        destination: "product",
        event: "first",
        context: { step: kind },
      },
    ]);
  },
);

test.each(
  [
    {
      label: "throws",
      reason: "error",
      reset: () => {
        throw new Error("the SDK refused the reset");
      },
    },
    {
      label: "rejects",
      reason: "error",
      reset: () => Promise.reject(new Error("the SDK refused the reset")),
    },
    {
      label: "passes its deadline",
      reason: "timeout",
      reset: () => new Promise<void>(() => {}),
    },
    {
      label: "throws TraceError UNSUPPORTED",
      reason: "unsupported",
      reset: () => {
        throw new TraceError({
          code: "UNSUPPORTED",
          message: "This SDK cannot reset.",
        });
      },
    },
  ].map((row): [string, typeof row] => [row.label, row]),
)(
  "a reset that %s is a failure: its entry is skipped and the next entry plans again",
  async (_, { reason, reset }) => {
    vi.useFakeTimers();

    let resets = 0;

    const { lane, log, enqueue, outcomes, records, setIdentity } = createLane({
      identity: ADA,
      timeout: 1_000,
      mock: {
        onIdentity: (call) => {
          if (call.kind !== "reset") {
            return;
          }

          resets += 1;

          if (resets === 1) {
            return reset();
          }
        },
      },
    });

    lane.start();
    setIdentity(BOB);
    enqueue("bob-first", BOB);
    enqueue("bob-second", BOB);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(outcomes.get("bob-first")).toEqual([IDENTITY_FAILED]);
    expect(outcomes.get("bob-second")).toEqual([SUBMITTED]);
    expect(log).toEqual([
      "open",
      "identify ada",
      "reset",
      "reset",
      "identify bob",
      "track bob-second",
    ]);
    expect(records.filter((record) => record.source === "identity")).toEqual([
      {
        source: "identity",
        type: "identity step failed",
        destination: "product",
        event: "bob-first",
        context: { step: "reset", reason },
      },
    ]);
  },
);

test("an identity change with nothing queued is applied at once by an idle pass", () => {
  const { lane, log, setIdentity } = createLane();

  lane.start();
  setIdentity(ADA);
  lane.identityChanged();

  expect(log).toEqual(["open", "identify ada"]);
});

test("an idle pass waits for the entries queued before it, and changes made meanwhile make one pass", async () => {
  const step = createDeferred<void>();
  let calls = 0;

  const { lane, log, enqueue, setIdentity } = createLane({
    mock: {
      onIdentity: () => {
        calls += 1;

        if (calls === 1) {
          return step.promise;
        }
      },
    },
  });

  lane.start();
  setIdentity(ADA);
  enqueue("waiting", ADA);
  setIdentity(ADA_PRO);
  lane.identityChanged();
  lane.identityChanged();
  step.resolve();
  await nextMacrotask();

  expect(log).toEqual(["open", "identify ada", "track waiting", "traits"]);
});

test("a failed idle pass is not retried until the next trigger", async () => {
  let calls = 0;

  const { lane, log, records, setIdentity } = createLane({
    mock: {
      onIdentity: () => {
        calls += 1;

        if (calls === 1) {
          return Promise.reject(new Error("the SDK refused"));
        }
      },
    },
  });

  lane.start();
  setIdentity(ADA);
  lane.identityChanged();
  await nextMacrotask();
  await nextMacrotask();

  expect(log).toEqual(["open", "identify ada"]);
  expect(records.filter((record) => record.source === "identity")).toEqual([
    {
      source: "identity",
      type: "identity step failed",
      destination: "product",
      event: null,
      context: { step: "identify", reason: "error" },
    },
  ]);

  lane.identityChanged();
  await nextMacrotask();

  expect(log).toEqual(["open", "identify ada", "reset", "identify ada"]);
});

test("an identity step that answers after its lane was disposed changes nothing and calls the session no more", async () => {
  const step = createDeferred<void>();

  const { lane, log, enqueue, outcomes, records, setIdentity } = createLane({
    mock: {
      onIdentity: (call) =>
        call.kind === "identify" ? step.promise : undefined,
    },
  });

  lane.start();
  setIdentity(ADA_PRO);
  enqueue("waiting", ADA_PRO);
  lane.dispose();

  expect(outcomes.get("waiting")).toEqual([
    { status: "dropped", reason: "disposed" },
  ]);

  step.resolve();
  await nextMacrotask();

  expect(log).toEqual(["open", "identify ada", "dispose"]);
  expect(records.filter((record) => record.source === "identity")).toEqual([]);
});

test.each(
  [
    {
      label: "answers",
      settle: (step: ReturnType<typeof createDeferred<void>>) => step.resolve(),
    },
    {
      label: "fails",
      settle: (step: ReturnType<typeof createDeferred<void>>) =>
        step.reject(new Error("the SDK refused")),
    },
  ].map((row): [string, typeof row] => [row.label, row]),
)(
  "an idle pass whose step %s after its lane was disposed records nothing and calls the session no more",
  async (_, { settle }) => {
    const step = createDeferred<void>();

    const { lane, log, records, setIdentity } = createLane({
      mock: {
        onIdentity: (call) =>
          call.kind === "identify" ? step.promise : undefined,
      },
    });

    lane.start();
    setIdentity(ADA_PRO);
    lane.identityChanged();
    lane.dispose();
    settle(step);
    await nextMacrotask();

    expect(log).toEqual(["open", "identify ada", "dispose"]);
    expect(records.filter((record) => record.source === "identity")).toEqual(
      [],
    );
  },
);

test("a diagnostics listener that disposes the lane during an idle pass stops the pass before its next step", () => {
  const { lane, log, setIdentity } = createLane({
    mock: {
      onIdentity: (call) => {
        if (call.kind === "identify") {
          throw new TraceError({
            code: "UNSUPPORTED",
            message: "This SDK cannot identify.",
          });
        }
      },
    },
    onRecord: (record) => {
      if (record.type === "identity step unsupported") {
        lane.dispose();
      }
    },
  });

  setIdentity({
    generation: 1,
    user: { id: "ada" },
    traits: { plan: "pro" },
    groups: { workspace: { id: "w_1", traits: {} } },
  });
  lane.start();

  expect(log).toEqual(["open", "identify ada", "dispose"]);
});

test("an idle pass stops when dropBefore drops the generation it targets, and the next plan resets", async () => {
  const step = createDeferred<void>();

  const { lane, log, enqueue, setIdentity } = createLane({
    mock: {
      onIdentity: (call) =>
        call.kind === "identify" && call.user.id === "ada"
          ? step.promise
          : undefined,
    },
  });

  setIdentity(ADA_PRO);
  lane.start();
  setIdentity(BOB);
  lane.dropBefore(2)();
  lane.identityChanged();
  enqueue("bob", BOB);
  step.resolve();
  await nextMacrotask();

  expect(log).toEqual([
    "open",
    "identify ada",
    "reset",
    "identify bob",
    "track bob",
  ]);
});

test.each(["then", "constructor"])(
  "an identity step that answers a promise whose %s cannot be read skips its entry, which lands exactly once",
  async (read) => {
    const unhandled = vi.fn();
    let calls = 0;

    process.on("unhandledRejection", unhandled);

    const { lane, log, enqueue, outcomes, setIdentity } = createLane({
      mock: {
        onIdentity: () => {
          calls += 1;

          if (calls === 1) {
            return createHostilePromise(read);
          }
        },
      },
    });

    lane.start();
    setIdentity(ADA);
    enqueue("first", ADA);
    enqueue("second", ADA);
    await nextMacrotask();
    lane.dispose();
    await nextMacrotask();
    process.off("unhandledRejection", unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    expect(outcomes.get("first")).toEqual([IDENTITY_FAILED]);
    expect(outcomes.get("second")).toEqual([SUBMITTED]);
    expect(log).toEqual([
      "open",
      "identify ada",
      "reset",
      "identify ada",
      "track second",
      "dispose",
    ]);
  },
);

test("a session replaced by a retry never answers for the new one", async () => {
  const late = createMockAdapter();
  const retried = createMockAdapter();
  const answer = createDeferred<AnalyticsSession>();
  let attempts = 0;

  const adapter: AnalyticsAdapter = {
    name: "retried",
    // @ts-expect-error A JavaScript adapter can answer a promise of its session from open.
    open: () => {
      attempts += 1;

      if (attempts === 1) {
        return answer.promise;
      }

      return retried.adapter.open();
    },
  };

  const { lane, enqueue, outcomes } = createLane({ adapter, identity: ADA });

  enqueue("waiting", ADA);
  lane.start();

  expect(lane.status.get().state).toBe("failed");

  lane.start();
  answer.resolve(late.adapter.open());
  await nextMacrotask();

  expect(late.sessions[0]?.identity).toEqual([]);
  expect(late.sessions[0]?.events).toEqual([]);
  expect(retried.sessions[0]?.identity).toEqual([
    { kind: "identify", user: { id: "ada" } },
  ]);
  expect(retried.sessions[0]?.events.map((event) => event.id)).toEqual([
    "waiting",
  ]);
  expect(outcomes.get("waiting")).toEqual([SUBMITTED]);
  expect(lane.native()).toBe(retried.sessions[0]);
});

test("dropBefore raises the floor and takes what it drops at once, and lands it only when its answer is called", () => {
  const { lane, log, enqueue, outcomes, setIdentity } = createLane();

  enqueue("ada", ADA);
  setIdentity(BOB);

  const land = lane.dropBefore(2);

  expect(outcomes.get("ada")).toEqual([]);
  expect(lane.buffered()).toBe(0);

  enqueue("ada-late", ADA);
  lane.start();

  expect(outcomes.get("ada-late")).toEqual([
    { status: "dropped", reason: "identity-changed" },
  ]);
  expect(log).toEqual(["open", "reset", "identify bob"]);

  land();

  expect(outcomes.get("ada")).toEqual([
    { status: "dropped", reason: "identity-changed" },
  ]);
});

test("a lane disposed between dropBefore's two phases lands what it took as identity-changed, and the answer later lands nothing twice", () => {
  const { lane, enqueue, outcomes, setIdentity } = createLane();

  enqueue("ada", ADA);
  enqueue("bob", BOB);
  setIdentity(BOB);

  const land = lane.dropBefore(2);

  lane.dispose();

  expect(outcomes.get("ada")).toEqual([
    { status: "dropped", reason: "identity-changed" },
  ]);
  expect(outcomes.get("bob")).toEqual([
    { status: "dropped", reason: "disposed" },
  ]);

  land();

  expect(outcomes.get("ada")).toEqual([
    { status: "dropped", reason: "identity-changed" },
  ]);
});

test("dropBefore drops what waits from earlier generations as identity-changed and keeps later ones", () => {
  const { lane, log, enqueue, outcomes, setIdentity } = createLane();

  enqueue("anonymous", ANONYMOUS);
  enqueue("ada", ADA);
  enqueue("bob", BOB);
  setIdentity(BOB);
  lane.dropBefore(2)();

  expect(outcomes.get("anonymous")).toEqual([
    { status: "dropped", reason: "identity-changed" },
  ]);
  expect(outcomes.get("ada")).toEqual([
    { status: "dropped", reason: "identity-changed" },
  ]);
  expect(outcomes.get("bob")).toEqual([]);
  expect(lane.buffered()).toBe(1);

  lane.start();

  expect(log).toEqual(["open", "reset", "identify bob", "track bob"]);
});

test.each(
  [
    {
      label: "a ready lane",
      open: true,
      log: ["open", "identify ada", "reset", "identify bob"],
    },
    {
      label: "a lane that has not opened yet",
      open: false,
      log: ["open", "reset", "identify bob"],
    },
  ].map((row): [string, typeof row] => [row.label, row]),
)(
  "on %s, an entry of a generation that dropBefore already dropped lands identity-changed at once and is never tracked",
  (_, { open, log: expected }) => {
    const { lane, log, enqueue, outcomes, setIdentity } = createLane();

    setIdentity(ADA);

    if (open) {
      lane.start();
    }

    setIdentity(BOB);
    lane.dropBefore(2)();
    lane.identityChanged();
    enqueue("ada-late", ADA);

    expect(outcomes.get("ada-late")).toEqual([
      { status: "dropped", reason: "identity-changed" },
    ]);
    expect(lane.buffered()).toBe(0);

    lane.start();

    expect(log).toEqual(expected);
  },
);

test("an entry pass never skips its identity steps for the floor, even when its target lags its event", () => {
  const { lane, log, setIdentity } = createLane();
  const landed: DestinationOutcome[] = [];

  lane.start();
  setIdentity(SIGNED_OUT);
  lane.dropBefore(2)();
  lane.identityChanged();
  lane.enqueue({
    event: {
      id: "lagging",
      name: "App Opened",
      properties: {},
      context: {},
      identity: { generation: 2, user: { id: "ada" }, traits: {}, groups: {} },
      timestamp: 1,
    },
    identity: ADA,
    losses: [],
    land: (outcome) => {
      landed.push(outcome);
    },
  });

  expect(landed).toEqual([SUBMITTED]);
  expect(log).toEqual([
    "open",
    "reset",
    "reset",
    "identify ada",
    "track lagging",
  ]);
});

test("dropBefore leaves an entry that was already handed off alone", async () => {
  const { lane, mock, enqueue, outcomes, landed, setIdentity } = createLane({
    mock: { hold: true },
  });

  lane.start();
  setIdentity(ADA);
  enqueue("handed-off", ADA);
  lane.dropBefore(2)();

  expect(outcomes.get("handed-off")).toEqual([]);

  mock.tracks[0]?.settle();
  await landed("handed-off");

  expect(outcomes.get("handed-off")).toEqual([SUBMITTED]);
});

test("an entry whose identity step is in flight when its generation is dropped is never handed off, and its pass stops", async () => {
  const step = createDeferred<void>();

  const { lane, log, enqueue, outcomes, setIdentity } = createLane({
    mock: {
      onIdentity: (call) =>
        call.kind === "identify" && call.user.id === "ada"
          ? step.promise
          : undefined,
    },
  });

  lane.start();
  setIdentity(ADA_PRO);
  enqueue("ada", ADA_PRO);
  setIdentity(BOB);
  lane.dropBefore(2)();
  enqueue("bob", BOB);

  expect(outcomes.get("ada")).toEqual([
    { status: "dropped", reason: "identity-changed" },
  ]);

  step.resolve();
  await nextMacrotask();

  expect(log).toEqual([
    "open",
    "identify ada",
    "reset",
    "identify bob",
    "track bob",
  ]);
  expect(outcomes.get("bob")).toEqual([SUBMITTED]);
});
