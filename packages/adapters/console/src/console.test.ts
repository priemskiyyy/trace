import { event, Trace } from "@priemskiyyy/trace";
import type { Receipt, TrackContext } from "@priemskiyyy/trace";
import { expect, test, vi } from "vitest";

import { EVENT, GROUP, IDENTIFY, TRAITS } from "src/calls.fixture";
import { console } from "src/console";
import type { ConsoleEntry } from "src/types/ConsoleEntry";
import type { ConsoleWriter } from "src/types/ConsoleWriter";
import { assertUnreachable } from "src/utils/assertUnreachable";

const TIMESTAMP = 1_767_225_600_000;

const CONTEXT: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const SECRET = "hunter2-hunter2";

const events = {
  "App Opened": event(),
  "Checkout Started": event<{ cartId: string; value: number }>(),
  "Password Changed": event<{ password: string; strength: number }>(),
};

const createTrace = (writer?: ConsoleWriter) =>
  new Trace({
    events,
    destinations: {
      console: writer === undefined ? console() : console({ writer }),
    },
    now: () => TIMESTAMP,
  });

const settle = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const write = (
  session: ReturnType<ReturnType<typeof console>["open"]>,
  kind: ConsoleEntry["kind"],
) => {
  if (kind === "track") {
    return session.track(EVENT, CONTEXT);
  }

  if (kind === "identify") {
    return session.identify?.(IDENTIFY);
  }

  if (kind === "traits") {
    return session.traits?.(TRAITS);
  }

  if (kind === "group") {
    return session.group?.(GROUP);
  }

  if (kind === "reset") {
    return session.reset?.();
  }

  return assertUnreachable(kind);
};

test("creating the adapter writes nothing and touches no console", () => {
  const info = vi
    .spyOn(globalThis.console, "info")
    .mockImplementation(() => {});

  const writer = vi.fn<ConsoleWriter>();

  console({ writer });
  console();

  expect(writer.mock.calls).toEqual([]);
  expect(info.mock.calls).toEqual([]);
});

test("an injected writer receives the kind, a one line summary and the frozen event", async () => {
  const writer = vi.fn<ConsoleWriter>();
  const session = console({ writer }).open();

  await session.track(EVENT, CONTEXT);

  const entry = writer.mock.calls[0]?.[0];

  expect(writer.mock.calls).toStrictEqual([
    [
      {
        kind: "track",
        line: '[trace] track "Checkout Started" ["cartId","value"]',
        event: EVENT,
      },
    ],
  ]);
  expect(entry?.kind === "track" ? entry.event : null).toBe(EVENT);
});

test("an injected writer receives each identity call with its kind, its line and its frozen update", async () => {
  const writer = vi.fn<ConsoleWriter>();
  const session = console({ writer }).open();

  await session.identify?.(IDENTIFY);
  await session.traits?.(TRAITS);
  await session.group?.(GROUP);
  await session.reset?.();

  expect(writer.mock.calls).toStrictEqual([
    [
      {
        kind: "identify",
        line: '[trace] identify "user_42"',
        update: IDENTIFY,
      },
    ],
    [
      {
        kind: "traits",
        line: '[trace] traits "user_42" set ["plan"] remove ["role"]',
        update: TRAITS,
      },
    ],
    [
      {
        kind: "group",
        line: '[trace] group "workspace" "w_1" ["tier"]',
        update: GROUP,
      },
    ],
    [{ kind: "reset", line: "[trace] reset" }],
  ]);

  const updates = writer.mock.calls.map(([entry]) =>
    "update" in entry ? entry.update : null,
  );

  expect(updates[0]).toBe(IDENTIFY);
  expect(updates[1]).toBe(TRAITS);
  expect(updates[2]).toBe(GROUP);
});

test("an event is submitted with sdk-call-returned evidence once the writer returned, with nothing lost", async () => {
  const session = console({ writer: () => {} }).open();

  await expect(session.track(EVENT, CONTEXT)).resolves.toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
  });
});

test("without a writer, each call a Trace makes goes to console.info with its line and the value it describes", async () => {
  const info = vi
    .spyOn(globalThis.console, "info")
    .mockImplementation(() => {});

  const trace = createTrace();

  trace.start();
  trace.user({ id: "user_42", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { tier: "pro" } });

  const checkout = trace.track("Checkout Started", {
    cartId: "cart_1",
    value: 49.5,
  });

  await checkout.settled;
  trace.user(null);

  const opened = trace.track("App Opened");

  await opened.settled;

  expect(info.mock.calls).toEqual([
    ['[trace] identify "user_42"', { user: { id: "user_42" } }],
    [
      '[trace] traits "user_42" set ["plan"]',
      { user: { id: "user_42" }, set: { plan: "pro" }, remove: [] },
    ],
    [
      '[trace] group "workspace" "w_1" ["tier"]',
      {
        user: { id: "user_42" },
        group: { type: "workspace", id: "w_1", traits: { tier: "pro" } },
      },
    ],
    [
      '[trace] track "Checkout Started" ["cartId","value"]',
      {
        id: checkout.id,
        name: "Checkout Started",
        properties: { cartId: "cart_1", value: 49.5 },
        context: {},
        identity: {
          generation: 1,
          user: { id: "user_42" },
          traits: { plan: "pro" },
          groups: { workspace: { id: "w_1", traits: { tier: "pro" } } },
        },
        timestamp: TIMESTAMP,
      },
    ],
    ["[trace] reset"],
    [
      '[trace] track "App Opened"',
      {
        id: opened.id,
        name: "App Opened",
        properties: {},
        context: {},
        identity: { generation: 2, user: null, traits: {}, groups: {} },
        timestamp: TIMESTAMP,
      },
    ],
  ]);
});

test.each([
  "track",
  "identify",
  "traits",
  "group",
  "reset",
] satisfies ConsoleEntry["kind"][])(
  "the %s call waits for an asynchronous writer before it finishes",
  async (kind) => {
    let finish = () => {};

    const writing = new Promise<void>((resolve) => {
      finish = resolve;
    });

    const session = console({ writer: () => writing }).open();
    const done: string[] = [];

    const called = Promise.resolve(write(session, kind)).then(() => {
      done.push(kind);
    });

    await settle();

    expect(done).toEqual([]);

    finish();
    await called;

    expect(done).toEqual([kind]);
  },
);

test("a session writes events and identity calls and has no collection, flush or dispose", () => {
  expect(Object.keys(console().open())).toEqual([
    "native",
    "track",
    "identify",
    "traits",
    "group",
    "reset",
  ]);
});

test("through a Trace, the writer receives the event exactly as every destination does, with its context, identity and time", async () => {
  const writer = vi.fn<ConsoleWriter>();
  const trace = createTrace(writer);

  trace.start();
  trace.context({ app: { version: "2.4.0" } });

  const receipt = trace.track(
    "Checkout Started",
    { cartId: "cart_1", value: 49.5 },
    { context: { screen: "checkout" } },
  );

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      console: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  expect(writer.mock.calls).toEqual([
    [
      {
        kind: "track",
        line: '[trace] track "Checkout Started" ["cartId","value"]',
        event: {
          id: receipt.id,
          name: "Checkout Started",
          properties: { cartId: "cart_1", value: 49.5 },
          context: { app: { version: "2.4.0" }, screen: "checkout" },
          identity: { generation: 0, user: null, traits: {}, groups: {} },
          timestamp: TIMESTAMP,
        },
      },
    ],
  ]);
});

test("what reaches the writer is already redacted", async () => {
  const writer = vi.fn<ConsoleWriter>();
  const trace = createTrace(writer);

  trace.start();

  const settled = await trace.track("Password Changed", {
    password: SECRET,
    strength: 3,
  }).settled;

  expect(JSON.stringify(writer.mock.calls)).not.toContain(SECRET);
  expect(writer.mock.calls[0]?.[0].line).toBe(
    '[trace] track "Password Changed" ["strength"]',
  );
  expect(settled).toEqual({
    state: "settled",
    outcomes: {
      console: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [{ path: "properties.password", reason: "redacted" }],
      },
    },
  });
});

test("a console that tracks what it prints cannot start a feedback loop", async () => {
  const printed: unknown[] = [];
  const trace = createTrace();
  const forwarded: Receipt<"console">[] = [];

  vi.spyOn(globalThis.console, "info").mockImplementation((line) => {
    printed.push(line);
    forwarded.push(trace.track("App Opened"));
  });
  trace.start();

  await trace.track("App Opened").settled;

  expect(printed).toStrictEqual(['[trace] track "App Opened"']);
  await expect(forwarded[0]?.settled).resolves.toStrictEqual({
    state: "dropped",
    reason: "reentrant",
  });
});

test("a writer that throws is a failed outcome and never reaches the application", async () => {
  const failure = new Error("writer exploded");

  const trace = createTrace(() => {
    throw failure;
  });

  trace.start();

  await expect(trace.track("App Opened").settled).resolves.toEqual({
    state: "settled",
    outcomes: { console: { status: "failed", error: failure } },
  });
});

test("a writer that fails an identity call skips the event that needed it as identity-failed", async () => {
  const failure = new Error("writer exploded");

  const trace = createTrace(({ kind }) => {
    if (kind === "identify") {
      throw failure;
    }
  });

  trace.start();
  trace.user({ id: "ada" });

  await expect(trace.track("App Opened").settled).resolves.toEqual({
    state: "settled",
    outcomes: { console: { status: "skipped", reason: "identity-failed" } },
  });
});

test("an asynchronous writer keeps the receipt pending until it finishes", async () => {
  let finish = () => {};

  const writing = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const trace = createTrace(() => writing);

  trace.start();

  const receipt = trace.track("App Opened");

  await settle();

  expect(receipt.status.get()).toEqual({
    state: "pending",
    outcomes: { console: null },
  });

  finish();

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      console: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
});

test("an asynchronous writer failure is reflected in its receipt", async () => {
  const failure = new Error("async writer failed");
  const writing = Promise.reject(failure);

  writing.catch(() => {});

  const trace = createTrace(() => writing);

  trace.start();

  await expect(trace.track("App Opened").settled).resolves.toEqual({
    state: "settled",
    outcomes: { console: { status: "failed", error: failure } },
  });
});

test("the native handle is the writer in use", () => {
  const writer = vi.fn<ConsoleWriter>();
  const trace = createTrace(writer);

  expect(trace.destination("console").native).toBe(null);

  trace.start();

  expect(trace.destination("console").native).toBe(writer);
});

test("a user switch reaches the writer as a reset before the next user is identified", async () => {
  const writer = vi.fn<ConsoleWriter>();
  const trace = createTrace(writer);

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  await trace.track("App Opened").settled;
  trace.user({ id: "bob" });
  await trace.track("App Opened").settled;

  expect(writer.mock.calls.map(([{ line }]) => line)).toStrictEqual([
    '[trace] identify "ada"',
    '[trace] traits "ada" set ["plan"]',
    '[trace] track "App Opened"',
    "[trace] reset",
    '[trace] identify "bob"',
    '[trace] track "App Opened"',
  ]);
});

test("a console named in consent writes nothing while its purposes are not granted", async () => {
  const writer = vi.fn<ConsoleWriter>();

  const trace = new Trace({
    events,
    destinations: { console: console({ writer }) },
    consent: { console: ["analytics"] },
    now: () => TIMESTAMP,
  });

  trace.start();
  trace.user({ id: "ada" });

  await expect(trace.track("App Opened").settled).resolves.toStrictEqual({
    state: "dropped",
    reason: "consent",
  });
  expect(writer.mock.calls).toStrictEqual([]);

  trace.consent.set({ analytics: "granted" });
  await trace.track("App Opened").settled;

  expect(writer.mock.calls.map(([{ line }]) => line)).toStrictEqual([
    '[trace] identify "ada"',
    '[trace] track "App Opened"',
  ]);
});
