import { readFileSync } from "node:fs";

import { afterEach, expect, expectTypeOf, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { MockIdentityCall } from "src/mock/types/MockIdentityCall";
import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { AnalyticsSession } from "src/types/AnalyticsSession";
import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { EventDefinition } from "src/types/EventDefinition";
import type { TraceDiagnosticEvent } from "src/types/TraceDiagnosticEvent";
import type { TrackOptions } from "src/types/TrackOptions";
import { createDeferred } from "src/utils/common/createDeferred";
import { event } from "src/utils/event";
import { isSensitiveKey } from "src/utils/isSensitiveKey";
import { Trace } from "src/utils/Trace";
import { TraceError } from "src/utils/TraceError";

afterEach(() => {
  vi.useRealTimers();
});

const events = {
  "Checkout Started": event<{ cart: { id: string } }>(),
};

const SUBMITTED: DestinationOutcome = {
  status: "submitted",
  evidence: "sdk-call-returned",
  event: null,
  losses: [],
};

const IDENTITY_CHANGED: DestinationOutcome = {
  status: "dropped",
  reason: "identity-changed",
};

const CONTRACT: PropertyKey[] = [
  "native",
  "track",
  "identify",
  "traits",
  "group",
  "reset",
  "collection",
  "flush",
  "dispose",
];

const TITLE = /(?:\btest|\))\(\s*"((?:[^"\\]|\\.)*)"/g;

const NOW = 1_767_225_600_000;

const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const readRepositoryFile = (path: string) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8");

const getTitles = (source: string) =>
  Array.from(source.matchAll(TITLE)).flatMap(([, title]) => {
    if (title === undefined) {
      return [];
    }

    return [title];
  });

const isTestTitle = (path: string, name: string) => {
  const source = readRepositoryFile(path);

  return getTitles(source).some((title) => {
    if (title === name) {
      return true;
    }

    const [head, tail, ...more] = title.split("%s");

    if (
      head === undefined ||
      tail === undefined ||
      more.length > 0 ||
      head + tail === ""
    ) {
      return false;
    }

    return (
      name.length > head.length + tail.length &&
      name.startsWith(head) &&
      name.endsWith(tail) &&
      source.includes(
        JSON.stringify(name.slice(head.length, name.length - tail.length)),
      )
    );
  });
};

const getNamedTests = (cell: string) => {
  const named: { file: string; name: string }[] = [];

  let file = "";

  for (const [, path, name] of cell.matchAll(/`([^`]+\.ts)`|"([^"]+)"/g)) {
    if (path !== undefined) {
      file = path.startsWith("packages/") ? path : `packages/core/src/${path}`;
    } else if (name !== undefined) {
      named.push({ file, name });
    }
  }

  return named;
};

const createNotInitialized = () =>
  new TraceError({
    code: "NOT_INITIALIZED",
    message: "The SDK is not initialized yet.",
  });

const checkout = (id: string) => ({ cart: { id } });

test("release gate 1: Alice's queued event can never become Bob's", async () => {
  const held = createDeferred();

  let ready = false;

  const late = createMockAdapter({
    name: "late",
    onOpen: () => {
      if (!ready) {
        throw createNotInitialized();
      }
    },
  });

  const waiting = createMockAdapter({
    name: "waiting",
    onIdentity: (call) =>
      call.kind === "identify" && call.user.id === "alice"
        ? held.promise
        : undefined,
  });

  const flying = createMockAdapter({ name: "flying", hold: true });

  const trace = new Trace({
    events,
    destinations: {
      late: late.adapter,
      waiting: waiting.adapter,
      flying: flying.adapter,
    },
  });

  trace.start();
  trace.user({ id: "alice" });

  const alice = trace.track("Checkout Started", checkout("alice-cart"));

  trace.user({ id: "bob" });

  const bob = trace.track("Checkout Started", checkout("bob-cart"));

  held.resolve();
  ready = true;
  trace.start();
  flying.tracks[0]?.settle();
  flying.tracks[1]?.settle();

  await expect(alice.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      late: IDENTITY_CHANGED,
      waiting: IDENTITY_CHANGED,
      flying: SUBMITTED,
    },
  });
  await expect(bob.settled).resolves.toEqual({
    state: "settled",
    outcomes: { late: SUBMITTED, waiting: SUBMITTED, flying: SUBMITTED },
  });
  expect(
    [late, waiting, flying].map((mock) =>
      mock.sessions[0]?.events.map(({ properties, identity }) => [
        properties,
        identity.user,
      ]),
    ),
  ).toEqual([
    [[checkout("bob-cart"), { id: "bob" }]],
    [[checkout("bob-cart"), { id: "bob" }]],
    [
      [checkout("alice-cart"), { id: "alice" }],
      [checkout("bob-cart"), { id: "bob" }],
    ],
  ]);
  expect(
    [late, waiting, flying].map((mock) => mock.sessions[0]?.identity),
  ).toEqual<MockIdentityCall[][]>([
    [{ kind: "reset" }, { kind: "identify", user: { id: "bob" } }],
    [
      { kind: "identify", user: { id: "alice" } },
      { kind: "reset" },
      { kind: "identify", user: { id: "bob" } },
    ],
    [
      { kind: "identify", user: { id: "alice" } },
      { kind: "reset" },
      { kind: "identify", user: { id: "bob" } },
    ],
  ]);
});

test("release gate 2: user(null) starts a clean generation, and pending work of the previous user is never sent", async () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.user({ id: "alice", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { tier: "team" } });

  const pending = trace.track("Checkout Started", checkout("alice-cart"));

  trace.user(null);

  const anonymous = trace.track("Checkout Started", checkout("guest-cart"));

  trace.start();

  await expect(pending.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: IDENTITY_CHANGED },
  });
  await expect(anonymous.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: SUBMITTED },
  });
  expect(
    mock.sessions[0]?.events.map(({ properties, identity }) => ({
      properties,
      identity,
    })),
  ).toEqual([
    {
      properties: checkout("guest-cart"),
      identity: { generation: 2, user: null, traits: {}, groups: {} },
    },
  ]);
  expect(mock.sessions[0]?.identity).toEqual([{ kind: "reset" }]);
  expect(trace.diagnostics.get().identity).toEqual({
    generation: 2,
    user: null,
  });
});

test("release gate 3: a consent-gated destination receives nothing until its purposes are granted, and its provider's collection is switched off while they are not", async () => {
  const gated = createMockAdapter({ name: "gated" });
  const open = createMockAdapter({ name: "open" });

  const trace = new Trace({
    events,
    destinations: { gated: gated.adapter, open: open.adapter },
    consent: { gated: ["analytics", "advertising"] },
  });

  trace.user({ id: "alice", traits: { plan: "pro" } });
  trace.start();

  const unknown = trace.track("Checkout Started", checkout("cart_1"));

  trace.consent.set({ analytics: "granted" });

  const partial = trace.track("Checkout Started", checkout("cart_2"));

  trace.consent.set({ advertising: "denied" });

  const denied = trace.track("Checkout Started", checkout("cart_3"));

  expect(gated.sessions[0]).toEqual({
    events: [],
    identity: [],
    collection: [false],
    flushes: [],
    disposeCount: 0,
  });

  trace.consent.set({ advertising: "granted" });

  const granted = trace.track("Checkout Started", checkout("cart_4"));

  expect(
    await Promise.all(
      [unknown, partial, denied, granted].map(({ settled }) => settled),
    ),
  ).toEqual([
    { state: "settled", outcomes: { open: SUBMITTED } },
    { state: "settled", outcomes: { open: SUBMITTED } },
    { state: "settled", outcomes: { open: SUBMITTED } },
    { state: "settled", outcomes: { gated: SUBMITTED, open: SUBMITTED } },
  ]);
  expect(gated.sessions[0]?.events.map(({ properties }) => properties)).toEqual(
    [checkout("cart_4")],
  );
  expect(gated.sessions[0]?.identity).toEqual<MockIdentityCall[]>([
    { kind: "identify", user: { id: "alice" } },
    { kind: "traits", user: { id: "alice" }, set: { plan: "pro" }, remove: [] },
  ]);
  expect(gated.sessions[0]?.collection).toEqual([false, true]);
});

test("release gate 4: revocation drops Trace-owned pending work for that destination", async () => {
  const held = createDeferred();

  const gated = createMockAdapter({
    name: "gated",
    hold: true,
    onIdentity: () => held.promise,
  });

  const other = createMockAdapter({ name: "other" });

  const trace = new Trace({
    events,
    destinations: { gated: gated.adapter, other: other.adapter },
    consent: { gated: ["analytics"] },
  });

  trace.consent.set({ analytics: "granted" });

  const buffered = trace.track("Checkout Started", checkout("cart_1"));

  trace.consent.set({ analytics: "denied" });
  trace.consent.set({ analytics: "granted" });
  trace.start();

  const flying = trace.track("Checkout Started", checkout("cart_2"));

  trace.user({ id: "alice" });

  const waiting = trace.track("Checkout Started", checkout("cart_3"));

  trace.consent.set({ analytics: "denied" });
  gated.tracks[0]?.settle();
  held.resolve();
  trace.consent.set({ analytics: "granted" });

  const dropped = {
    state: "settled",
    outcomes: {
      gated: { status: "dropped", reason: "consent" },
      other: SUBMITTED,
    },
  };

  expect(
    await Promise.all(
      [buffered, flying, waiting].map(({ settled }) => settled),
    ),
  ).toEqual([
    dropped,
    { state: "settled", outcomes: { gated: SUBMITTED, other: SUBMITTED } },
    dropped,
  ]);
  expect(gated.sessions[0]?.events.map(({ properties }) => properties)).toEqual(
    [checkout("cart_2")],
  );
  expect(other.sessions[0]?.events.map(({ properties }) => properties)).toEqual(
    [checkout("cart_1"), checkout("cart_2"), checkout("cart_3")],
  );
  expect(gated.sessions[0]?.collection).toEqual([true, false, true]);
});

test("release gate 5: one destination's failure never affects another", async () => {
  const healthy = createMockAdapter({ name: "healthy" });

  const unopened = createMockAdapter({
    name: "unopened",
    onOpen: () => {
      throw new Error("open failed");
    },
  });

  const throwing = createMockAdapter({
    name: "throwing",
    onTrack: () => {
      throw new Error("track failed");
    },
  });

  const rejecting = createMockAdapter({
    name: "rejecting",
    onTrack: () => ({ status: "failed", error: new Error("rejected") }),
  });

  const unidentified = createMockAdapter({
    name: "unidentified",
    onIdentity: () => {
      throw new Error("identify failed");
    },
  });

  const hanging = createMockAdapter({ name: "hanging", hold: true });

  const trace = new Trace({
    events,
    destinations: {
      healthy: healthy.adapter,
      unopened: unopened.adapter,
      throwing: throwing.adapter,
      rejecting: rejecting.adapter,
      unidentified: unidentified.adapter,
      hanging: hanging.adapter,
    },
  });

  trace.start();
  trace.user({ id: "alice" });

  const receipts = [
    trace.track("Checkout Started", checkout("cart_1")),
    trace.track("Checkout Started", checkout("cart_2")),
  ];

  expect(receipts.map(({ status }) => status.get())).toEqual(
    Array.from({ length: 2 }, () => ({
      state: "pending",
      outcomes: {
        healthy: SUBMITTED,
        unopened: null,
        throwing: { status: "failed", error: new Error("track failed") },
        rejecting: { status: "failed", error: new Error("rejected") },
        unidentified: { status: "skipped", reason: "identity-failed" },
        hanging: null,
      },
    })),
  );
  expect(
    healthy.sessions[0]?.events.map(({ properties }) => properties),
  ).toEqual([checkout("cart_1"), checkout("cart_2")]);
  expect(healthy.sessions[0]?.identity).toEqual([
    { kind: "identify", user: { id: "alice" } },
  ]);
  expect(trace.destination("healthy").status.get()).toEqual({
    state: "ready",
  });
  expect(trace.destination("unopened").status.get()).toEqual({
    state: "failed",
    error: new Error("open failed"),
  });

  trace.dispose();

  expect(
    [healthy, throwing, rejecting, unidentified, hanging].map(
      ({ sessions }) => sessions[0]?.disposeCount,
    ),
  ).toEqual([1, 1, 1, 1, 1]);
});

test("release gate 6: flush has a deterministic boundary", async () => {
  const mock = createMockAdapter({ hold: true });
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();

  const before = trace.track("Checkout Started", checkout("cart_1"));
  const flushed = trace.flush({ timeout: 60_000 });
  const after = trace.track("Checkout Started", checkout("cart_2"));

  expect(
    await Promise.race([
      flushed.then(() => "flushed"),
      nextMacrotask().then(() => "waiting"),
    ]),
  ).toBe("waiting");

  mock.tracks[0]?.settle();

  await expect(flushed).resolves.toEqual({
    drained: true,
    destinations: { product: { status: "flushed" } },
  });
  expect(before.status.get()).toEqual({
    state: "settled",
    outcomes: { product: SUBMITTED },
  });
  expect(after.status.get()).toEqual({
    state: "pending",
    outcomes: { product: null },
  });
  expect(mock.sessions[0]?.flushes).toHaveLength(1);
});

test("release gate 7: a stale identity pass cannot change provider state after a newer one began", async () => {
  const held = createDeferred();

  const mock = createMockAdapter({
    onIdentity: (call) =>
      call.kind === "identify" && call.user.id === "alice"
        ? held.promise
        : undefined,
  });

  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();
  trace.user({ id: "alice", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_alice" });
  trace.user({ id: "bob", traits: { plan: "free" } });

  const receipt = trace.track("Checkout Started", checkout("bob-cart"));

  held.resolve();

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: SUBMITTED },
  });
  expect(mock.sessions[0]?.identity).toEqual<MockIdentityCall[]>([
    { kind: "identify", user: { id: "alice" } },
    { kind: "reset" },
    { kind: "identify", user: { id: "bob" } },
    { kind: "traits", user: { id: "bob" }, set: { plan: "free" }, remove: [] },
  ]);
  expect(mock.sessions[0]?.events.map(({ identity }) => identity)).toEqual([
    {
      generation: 2,
      user: { id: "bob" },
      traits: { plan: "free" },
      groups: {},
    },
  ]);
});

test("release gate 8: Trace never initializes or closes a provider SDK", async () => {
  const lifecycle = { init: 0, load: 0, shutdown: 0, close: 0 };
  const sdkReads: PropertyKey[] = [];
  const sessionReads: PropertyKey[] = [];

  const sdk = new Proxy(
    {
      init: () => {
        lifecycle.init += 1;
      },
      load: () => {
        lifecycle.load += 1;
      },
      shutdown: () => {
        lifecycle.shutdown += 1;
      },
      close: () => {
        lifecycle.close += 1;
      },
    },
    {
      get: (target, key, receiver: unknown): unknown => {
        sdkReads.push(key);

        return Reflect.get(target, key, receiver);
      },
    },
  );

  const mock = createMockAdapter();

  const adapter: AnalyticsAdapter<typeof sdk> = {
    name: "provider",
    open: () => {
      const session: AnalyticsSession<typeof sdk> = {
        ...mock.adapter.open(),
        native: sdk,
      };

      return new Proxy(session, {
        get: (target, key, receiver: unknown): unknown => {
          sessionReads.push(key);

          return Reflect.get(target, key, receiver);
        },
      });
    },
  };

  const trace = new Trace({
    events,
    destinations: { provider: adapter },
    consent: { provider: ["analytics"] },
    now: () => NOW,
  });

  trace.start();
  trace.consent.set({ analytics: "granted" });
  trace.user({ id: "alice", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1" });

  const receipt = trace.track("Checkout Started", checkout("cart_1"));

  await expect(trace.flush({ timeout: 1_000 })).resolves.toEqual({
    drained: true,
    destinations: { provider: { status: "flushed" } },
  });
  trace.consent.set({ analytics: "denied" });
  trace.user(null);
  trace.dispose();

  expect(trace.destination("provider").native).toBeNull();
  expect(lifecycle).toEqual({ init: 0, load: 0, shutdown: 0, close: 0 });
  expect(sdkReads).toEqual([]);
  expect(sessionReads.filter((key) => !CONTRACT.includes(key))).toEqual([]);
  expect(Object.keys(mock.adapter)).toEqual(["name", "open"]);
  expect(
    Object.keys(mock.adapter.open()).filter((key) => !CONTRACT.includes(key)),
  ).toEqual([]);
  expect(mock.sessions[0]?.events).toEqual([
    {
      id: receipt.id,
      name: "Checkout Started",
      properties: checkout("cart_1"),
      context: {},
      identity: {
        generation: 1,
        user: { id: "alice" },
        traits: { plan: "pro" },
        groups: { workspace: { id: "w_1", traits: {} } },
      },
      timestamp: NOW,
    },
  ]);
  expect(mock.sessions[0]?.identity).toEqual<MockIdentityCall[]>([
    { kind: "identify", user: { id: "alice" } },
    { kind: "traits", user: { id: "alice" }, set: { plan: "pro" }, remove: [] },
    {
      kind: "group",
      user: { id: "alice" },
      group: { type: "workspace", id: "w_1", traits: {} },
    },
  ]);
  expect(mock.sessions[0]?.collection).toEqual([false, true, false]);
  expect(
    mock.sessions[0]?.flushes.map(({ context }) => ({
      timeout: context.timeout,
      aborted: context.signal.aborted,
    })),
  ).toEqual([{ timeout: 1_000, aborted: false }]);
  expect(mock.sessions[0]?.disposeCount).toBe(1);
});

test("release gate 9: observation (status, diagnostics, events, bindings, devtools) creates no demand", () => {
  vi.useFakeTimers();

  const mock = createMockAdapter();
  const heard: string[] = [];

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    consent: { product: ["analytics"] },
  });

  const product = trace.destination("product");

  trace.status.subscribe(() => heard.push("status"));
  trace.consent.subscribe(() => heard.push("consent"));
  trace.diagnostics.subscribe(() => heard.push("snapshot"));
  trace.diagnostics.events.subscribe(({ type }) => heard.push(type));
  trace.events.subscribe(({ name }) => heard.push(name));
  product.status.subscribe(() => heard.push("destination"));

  expect([
    trace.status.get(),
    trace.consent.get(),
    product.status.get(),
    product.native,
  ]).toEqual([
    { state: "idle" },
    { analytics: "unknown" },
    { state: "idle" },
    null,
  ]);
  expect(trace.diagnostics.get()).toEqual({
    status: { state: "idle" },
    identity: { generation: 0, user: null },
    consent: { analytics: "unknown" },
    pendingReceipts: 0,
    destinations: [
      {
        name: "product",
        adapter: { name: "mock" },
        status: { state: "idle" },
        buffered: 0,
        inFlight: 0,
      },
    ],
  });
  expect(mock.sessions).toEqual([]);
  expect(mock.tracks).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
  expect(heard).toEqual([]);
});

test("release gate 10: Ampli's generated types flow to trace.track without redefinition", () => {
  type CheckoutStartedProperties = {
    cart_id: string;
    value: number;
    coupon?: "SPRING" | "SUMMER";
  };

  class CheckoutStarted {
    event_type = "Checkout Started";
    event_properties: CheckoutStartedProperties & { schema_version: 3 };

    constructor(event_properties: CheckoutStartedProperties) {
      this.event_properties = { ...event_properties, schema_version: 3 };
    }
  }

  const fromGenerated = <TProperties extends object, TOutput extends object>(
    Generated: new (properties: TProperties) => { event_properties: TOutput },
  ): EventDefinition<TProperties, TOutput> => ({
    parse: (input) => ({
      ok: true,
      properties: new Generated(input).event_properties,
    }),
  });

  const mock = createMockAdapter();

  const trace = new Trace({
    events: { "Checkout Started": fromGenerated(CheckoutStarted) },
    destinations: { product: mock.adapter },
  });

  trace.start();
  trace.track("Checkout Started", {
    cart_id: "c_1",
    value: 49,
    coupon: "SPRING",
  });

  expectTypeOf(trace.track<"Checkout Started">).parameters.toEqualTypeOf<
    [
      name: "Checkout Started",
      properties: CheckoutStartedProperties,
      options?: TrackOptions<"product">,
    ]
  >();
  expect(mock.sessions[0]?.events.map(({ properties }) => properties)).toEqual([
    { cart_id: "c_1", value: 49, coupon: "SPRING", schema_version: 3 },
  ]);
});

test("release gate 11: redacted data never reaches a destination or the events stream", async () => {
  const mock = createMockAdapter();
  const streamed: unknown[] = [];

  const trace = new Trace({
    events: {
      "Checkout Started": event<{
        cart: { id: string; token: string };
        card: { cvc: string };
      }>(),
    },
    destinations: { product: mock.adapter },
    defaults: { context: { app: "shop", apiKey: "secret-default" } },
    privacy: {
      redact: (key, path) =>
        isSensitiveKey(key) || key === "iban" || path === "properties.card.cvc",
    },
    now: () => NOW,
  });

  trace.events.subscribe((tracked) => streamed.push(tracked));
  trace.start();
  trace.context({ screen: "checkout", session_id: "secret-context" });
  trace.user({ id: "alice", traits: { plan: "pro", iban: "secret-trait" } });
  trace.group("workspace", {
    id: "w_1",
    traits: { tier: "team", password: "secret-group" },
  });
  trace.traits({ iban: null });

  const receipt = trace
    .scope({ context: { flow: "express", authorization: "secret-scope" } })
    .track(
      "Checkout Started",
      { cart: { id: "c_1", token: "secret-token" }, card: { cvc: "123" } },
      { context: { cookie: "secret-call" } },
    );

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      product: {
        ...SUBMITTED,
        losses: [
          "properties.cart.token",
          "properties.card.cvc",
          "context.apiKey",
          "context.session_id",
          "context.authorization",
          "context.cookie",
          "groups.workspace.password",
        ].map((path) => ({ path, reason: "redacted" })),
      },
    },
  });

  const delivered = {
    id: receipt.id,
    name: "Checkout Started",
    properties: { cart: { id: "c_1" }, card: {} },
    context: { app: "shop", screen: "checkout", flow: "express" },
    identity: {
      generation: 1,
      user: { id: "alice" },
      traits: { plan: "pro" },
      groups: { workspace: { id: "w_1", traits: { tier: "team" } } },
    },
    timestamp: NOW,
  };

  expect(mock.sessions[0]?.events).toEqual([delivered]);
  expect(streamed).toEqual([delivered]);
  expect(streamed[0]).toBe(mock.sessions[0]?.events[0]);
  expect(mock.sessions[0]?.identity).toEqual<MockIdentityCall[]>([
    { kind: "identify", user: { id: "alice" } },
    { kind: "traits", user: { id: "alice" }, set: { plan: "pro" }, remove: [] },
    {
      kind: "group",
      user: { id: "alice" },
      group: { type: "workspace", id: "w_1", traits: { tier: "team" } },
    },
  ]);
});

test("release gate 12: an operation a provider cannot perform is reported, never emulated", async () => {
  const groupless = createMockAdapter({ name: "groupless", flush: false });

  const refusing = createMockAdapter({
    name: "refusing",
    onIdentity: (call) => {
      if (call.kind === "group") {
        throw new TraceError({
          code: "UNSUPPORTED",
          message: "This provider has no groups.",
        });
      }
    },
  });

  const adapter: AnalyticsAdapter = {
    name: "groupless",
    open: () =>
      new Proxy(groupless.adapter.open(), {
        get: (target, key, receiver: unknown): unknown =>
          key === "group" ? undefined : Reflect.get(target, key, receiver),
      }),
  };

  const diagnostics: TraceDiagnosticEvent[] = [];

  const trace = new Trace({
    events,
    destinations: { groupless: adapter, refusing: refusing.adapter },
  });

  trace.diagnostics.events.subscribe((diagnostic) => {
    if (diagnostic.source === "identity") {
      diagnostics.push(diagnostic);
    }
  });
  trace.start();
  trace.user({ id: "alice" });
  trace.group("workspace", { id: "w_1", traits: { tier: "team" } });

  const receipt = trace.track("Checkout Started", checkout("cart_1"));

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: { groupless: SUBMITTED, refusing: SUBMITTED },
  });
  expect(
    [groupless, refusing].map(({ sessions }) =>
      sessions[0]?.events.map(({ properties, identity }) => ({
        properties,
        groups: identity.groups,
      })),
    ),
  ).toEqual(
    Array.from({ length: 2 }, () => [
      {
        properties: checkout("cart_1"),
        groups: { workspace: { id: "w_1", traits: { tier: "team" } } },
      },
    ]),
  );
  expect(
    [groupless, refusing].map(({ sessions }) => sessions[0]?.identity),
  ).toEqual<MockIdentityCall[][]>([
    [{ kind: "identify", user: { id: "alice" } }],
    [
      { kind: "identify", user: { id: "alice" } },
      {
        kind: "group",
        user: { id: "alice" },
        group: { type: "workspace", id: "w_1", traits: { tier: "team" } },
      },
    ],
  ]);
  expect(
    diagnostics.map(({ type, destination, context }) => ({
      type,
      destination,
      context,
    })),
  ).toEqual([
    {
      type: "user changed",
      destination: null,
      context: { generation: 1, user: { id: "alice" } },
    },
    {
      type: "identity step unsupported",
      destination: { name: "refusing" },
      context: { step: "group" },
    },
  ]);
  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: {
      groupless: { status: "unsupported" },
      refusing: { status: "flushed" },
    },
  });
});

test("release gate 13: buffer overflow is finite, deterministic and observable", async () => {
  const mock = createMockAdapter();
  const overflows: unknown[] = [];

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    buffer: { capacity: 2 },
  });

  trace.diagnostics.events.subscribe(
    ({ type, destination, event, context }) => {
      if (type === "buffer overflow") {
        overflows.push({ destination, event, context });
      }
    },
  );

  const receipts = ["cart_1", "cart_2", "cart_3", "cart_4"].map((id) =>
    trace.track("Checkout Started", checkout(id)),
  );

  expect(trace.diagnostics.get().destinations[0]?.buffered).toBe(2);

  trace.start();

  const overflowed = {
    state: "settled",
    outcomes: { product: { status: "dropped", reason: "buffer-overflow" } },
  };

  expect(await Promise.all(receipts.map(({ settled }) => settled))).toEqual([
    overflowed,
    overflowed,
    { state: "settled", outcomes: { product: SUBMITTED } },
    { state: "settled", outcomes: { product: SUBMITTED } },
  ]);
  expect(mock.sessions[0]?.events.map(({ properties }) => properties)).toEqual([
    checkout("cart_3"),
    checkout("cart_4"),
  ]);
  expect(overflows).toEqual(
    receipts.slice(0, 2).map(({ id }) => ({
      destination: { name: "product" },
      event: { id },
      context: { capacity: 2 },
    })),
  );
});

test("every test the architecture page names exists under that name, and the page names every release gate", () => {
  const named = readRepositoryFile("docs/internals/architecture.md")
    .split("\n")
    .flatMap((line) => {
      if (!line.startsWith("| ")) {
        return [];
      }

      return getNamedTests(line);
    });

  expect(
    named.flatMap(({ file, name }) => {
      if (file !== "" && isTestTitle(file, name)) {
        return [];
      }

      return [`${file === "" ? "no file" : file}: ${name}`];
    }),
  ).toEqual([]);
  expect(
    named.flatMap(({ name }) => {
      if (!name.startsWith("release gate")) {
        return [];
      }

      return [name];
    }),
  ).toEqual(
    getTitles(
      readRepositoryFile("packages/core/src/utils/releaseGates.test.ts"),
    ).filter((title) => title.startsWith("release gate ")),
  );
});
