import { expect, test } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { MockIdentityCall } from "src/mock/types/MockIdentityCall";
import type { MockTrack } from "src/mock/types/MockTrack";
import type { FlushContext } from "src/types/FlushContext";
import type { TrackContext } from "src/types/TrackContext";
import type { TrackedEvent } from "src/types/TrackedEvent";
import { createDeferred } from "src/utils/common/createDeferred";
import { TraceError } from "src/utils/TraceError";

const event: TrackedEvent = {
  id: "event-1",
  name: "App Opened",
  properties: {},
  context: {},
  identity: { generation: 0, user: null, traits: {}, groups: {} },
  timestamp: 1,
};

const context: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 0,
  now: () => 1,
};

const flushContext: FlushContext = {
  timeout: 100,
  signal: new AbortController().signal,
};

const submitted = { status: "submitted", evidence: "sdk-call-returned" };

test("creating the mock opens nothing, and the adapter names itself mock", () => {
  const mock = createMockAdapter();

  expect(mock.adapter.name).toBe("mock");
  expect(mock.sessions).toEqual([]);
  expect(mock.tracks).toEqual([]);
});

test("by default a track is recorded exactly as received and answered at once as submitted", () => {
  const mock = createMockAdapter();
  const session = mock.adapter.open();

  expect(session.track(event, context)).toEqual(submitted);
  expect(mock.sessions[0]?.events[0]).toBe(event);
  expect(mock.tracks).toHaveLength(1);
  expect(mock.tracks[0]?.event).toBe(event);
  expect(mock.tracks[0]?.context).toBe(context);
});

test("a held track waits for the test to answer it, as submitted unless told otherwise", async () => {
  const mock = createMockAdapter({ hold: true });
  const session = mock.adapter.open();

  const first = session.track(event, context);
  const second = session.track(event, context);

  mock.tracks[0]?.settle();
  mock.tracks[1]?.settle({ status: "indeterminate", reason: "ambiguous" });

  await expect(first).resolves.toEqual(submitted);
  await expect(second).resolves.toEqual({
    status: "indeterminate",
    reason: "ambiguous",
  });
});

test("a held track can be failed like a rejecting provider", async () => {
  const mock = createMockAdapter({ hold: true });
  const session = mock.adapter.open();
  const failure = new Error("network down");

  const pending = session.track(event, context);

  mock.tracks[0]?.fail(failure);

  await expect(pending).rejects.toBe(failure);
});

test("a track hook sees each track, and can throw like a synchronous provider failure or answer at once", () => {
  const failure = new Error("sdk threw");
  const seen: MockTrack[] = [];

  const watching = createMockAdapter({
    onTrack: (track) => {
      seen.push(track);
    },
  });

  const throwing = createMockAdapter({
    onTrack: () => {
      throw failure;
    },
  });

  const answering = createMockAdapter({
    hold: true,
    onTrack: () => ({ status: "dropped", reason: "provider-filtered" }),
  });

  expect(watching.adapter.open().track(event, context)).toEqual(submitted);
  expect(seen).toEqual(watching.tracks);
  expect(() => throwing.adapter.open().track(event, context)).toThrow(failure);
  expect(throwing.sessions[0]?.events).toEqual([event]);
  expect(answering.adapter.open().track(event, context)).toEqual({
    status: "dropped",
    reason: "provider-filtered",
  });
});

test("an open hook can throw like a provider that fails to start, and nothing is recorded", () => {
  const failure = new Error("the SDK is not initialized");

  const mock = createMockAdapter({
    onOpen: () => {
      throw failure;
    },
  });

  expect(() => mock.adapter.open()).toThrow(failure);
  expect(mock.sessions).toEqual([]);
});

test("the mock records every identity call in order with its arguments", () => {
  const mock = createMockAdapter();
  const session = mock.adapter.open();
  const ada = { id: "ada" };

  const answers = [
    session.reset?.(),
    session.identify?.({ user: ada }),
    session.traits?.({ user: ada, set: { plan: "pro" }, remove: ["role"] }),
    session.group?.({
      user: ada,
      group: { type: "workspace", id: "w_1", traits: { seats: 3 } },
    }),
    session.group?.({
      user: null,
      group: { type: "team", id: null, traits: {} },
    }),
  ];

  expect(answers).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  expect(mock.sessions[0]?.identity).toEqual([
    { kind: "reset" },
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
      user: null,
      group: { type: "team", id: null, traits: {} },
    },
  ]);
});

test("an identity hook sees each call, and can throw like a provider that refuses the update", () => {
  const refusal = new TraceError({
    code: "UNSUPPORTED",
    message: "This provider has no groups.",
  });

  const seen: MockIdentityCall[] = [];

  const mock = createMockAdapter({
    onIdentity: (call) => {
      seen.push(call);

      if (call.kind === "group") {
        throw refusal;
      }
    },
  });

  const session = mock.adapter.open();

  session.identify?.({ user: { id: "ada" } });

  expect(() =>
    session.group?.({
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: {} },
    }),
  ).toThrow(refusal);
  expect(seen).toEqual([
    { kind: "identify", user: { id: "ada" } },
    {
      kind: "group",
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: {} },
    },
  ]);
  expect(mock.sessions[0]?.identity).toEqual(seen);
});

test("an identity hook can hold a step, which answers when the test settles it", () => {
  const step = createDeferred();
  const mock = createMockAdapter({ onIdentity: () => step.promise });
  const session = mock.adapter.open();

  expect(session.identify?.({ user: { id: "ada" } })).toBe(step.promise);
  expect(session.reset?.()).toBe(step.promise);
});

test("identity, collection and flush are present unless each is turned off", () => {
  const keysOf = (options: Parameters<typeof createMockAdapter>[0]) =>
    Object.keys(createMockAdapter(options).adapter.open()).sort();

  expect(keysOf({})).toEqual([
    "collection",
    "dispose",
    "flush",
    "group",
    "identify",
    "native",
    "reset",
    "track",
    "traits",
  ]);
  expect(keysOf({ identity: false })).toEqual([
    "collection",
    "dispose",
    "flush",
    "native",
    "track",
  ]);
  expect(keysOf({ collection: false })).toEqual([
    "dispose",
    "flush",
    "group",
    "identify",
    "native",
    "reset",
    "track",
    "traits",
  ]);
  expect(keysOf({ flush: false })).toEqual([
    "collection",
    "dispose",
    "group",
    "identify",
    "native",
    "reset",
    "track",
    "traits",
  ]);
  expect(keysOf({ identity: false, collection: false, flush: false })).toEqual([
    "dispose",
    "native",
    "track",
  ]);
});

test("collection calls are recorded in order", () => {
  const mock = createMockAdapter();
  const session = mock.adapter.open();

  session.collection?.(false);
  session.collection?.(true);

  expect(mock.sessions[0]?.collection).toEqual([false, true]);
});

test("a flush answers flushed at once, and waits for the test when held", async () => {
  const quick = createMockAdapter();
  const held = createMockAdapter({ flush: "hold" });
  const failure = new Error("upload failed");

  expect(quick.adapter.open().flush?.(flushContext)).toEqual({
    status: "flushed",
  });
  expect(quick.sessions[0]?.flushes.map((flush) => flush.context)).toEqual([
    flushContext,
  ]);

  const session = held.adapter.open();

  const flushes = [
    session.flush?.(flushContext),
    session.flush?.(flushContext),
    session.flush?.(flushContext),
  ];

  held.sessions[0]?.flushes[0]?.settle();
  held.sessions[0]?.flushes[1]?.settle({ status: "timeout" });
  held.sessions[0]?.flushes[2]?.fail(failure);

  await expect(flushes[0]).resolves.toEqual({ status: "flushed" });
  await expect(flushes[1]).resolves.toEqual({ status: "timeout" });
  await expect(flushes[2]).rejects.toBe(failure);
});

test("the mock never guards itself, so tests can act after disposal", async () => {
  const mock = createMockAdapter();
  const session = mock.adapter.open();

  await session.dispose?.();
  await session.dispose?.();
  session.track(event, context);
  session.identify?.({ user: { id: "ada" } });

  expect(mock.sessions[0]?.disposeCount).toBe(2);
  expect(mock.sessions[0]?.events).toEqual([event]);
  expect(mock.sessions[0]?.identity).toEqual([
    { kind: "identify", user: { id: "ada" } },
  ]);
});

test("every open records into a session of its own, which is also its native handle", () => {
  const mock = createMockAdapter({ name: "product" });
  const first = mock.adapter.open();
  const second = mock.adapter.open();

  second.track(event, context);

  expect(mock.adapter.name).toBe("product");
  expect(mock.sessions).toHaveLength(2);
  expect(first.native).toBe(mock.sessions[0]);
  expect(second.native).toBe(mock.sessions[1]);
  expect(mock.sessions[0]?.events).toEqual([]);
  expect(mock.sessions[1]?.events).toEqual([event]);
  expect(mock.tracks.map((track) => track.event)).toEqual([event]);
});
