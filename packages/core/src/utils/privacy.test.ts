import { expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { ParseResult } from "src/types/ParseResult";
import type { TrackedEvent } from "src/types/TrackedEvent";
import { event } from "src/utils/event";
import { isSensitiveKey } from "src/utils/isSensitiveKey";
import { Trace } from "src/utils/Trace";

const events = {
  "App Opened": event(),
  "Card Added": event<Record<string, unknown>>(),
};

const submittedWith = (losses: unknown[]) => ({
  status: "submitted",
  evidence: "sdk-call-returned",
  event: null,
  losses,
});

test("a redacted property is removed and reported on the receipt, and the event is still delivered without it", async () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: { redact: (key) => isSensitiveKey(key) || key === "cvc" },
  });

  trace.start();

  const receipt = trace.track("Card Added", {
    card: { brand: "visa", cvc: "123" },
    password: "hunter2",
  });

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      product: submittedWith([
        { path: "properties.card.cvc", reason: "redacted" },
        { path: "properties.password", reason: "redacted" },
      ]),
    },
  });
  expect(mock.sessions[0]?.events[0]?.properties).toEqual({
    card: { brand: "visa" },
  });
});

test("a redacted context key is removed from whichever layer carried it and reported on the receipt, and the event is still delivered", async () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    defaults: { context: { app: "2.4.0", token: "t_1" } },
  });

  trace.start();
  trace.context({ secret: "s_1", locale: "de" });

  const receipt = trace
    .scope({ context: { cookie: "c_1", feature: "billing" } })
    .track("App Opened", undefined, {
      context: { password: "hunter2", screen: "home" },
    });

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      product: submittedWith([
        { path: "context.token", reason: "redacted" },
        { path: "context.secret", reason: "redacted" },
        { path: "context.cookie", reason: "redacted" },
        { path: "context.password", reason: "redacted" },
      ]),
    },
  });
  expect(mock.sessions[0]?.events[0]?.context).toEqual({
    app: "2.4.0",
    locale: "de",
    feature: "billing",
    screen: "home",
  });
});

test("a redacted trait or group trait is removed and reported on the receipt of every event it would have ridden, and the event is still delivered", async () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro", sessionId: "s_1" } });
  trace.group("workspace", {
    id: "w_1",
    traits: { apiKey: "k_1", size: 3 },
  });

  const losses = [
    { path: "traits.sessionId", reason: "redacted" },
    { path: "groups.workspace.apiKey", reason: "redacted" },
  ];

  const first = trace.track("App Opened");
  const second = trace.track("App Opened");

  await expect(first.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: submittedWith(losses) },
  });
  await expect(second.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: submittedWith(losses) },
  });
  expect(mock.sessions[0]?.events[0]?.identity).toEqual({
    generation: 1,
    user: { id: "ada" },
    traits: { plan: "pro" },
    groups: { workspace: { id: "w_1", traits: { size: 3 } } },
  });
});

test("a getter at the top of a trait, a group trait or a context layer is an omitted loss on the receipt of every event it would have ridden, and a key given as undefined is absent", async () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });
  const getter = vi.fn(() => "computed");

  const withGetter = (values: Record<string, unknown>, key: string) =>
    Object.defineProperty(values, key, { enumerable: true, get: getter });

  trace.start();
  trace.user({
    id: "ada",
    traits: withGetter({ plan: "pro", gone: undefined }, "tier"),
  });
  trace.group("workspace", {
    id: "w_1",
    traits: withGetter({ size: 3, gone: undefined }, "region"),
  });
  trace.context(withGetter({ screen: "home", gone: undefined }, "locale"));

  const losses = [
    { path: "context.locale", reason: "omitted" },
    { path: "traits.tier", reason: "omitted" },
    { path: "groups.workspace.region", reason: "omitted" },
  ];

  const first = trace.track("App Opened");
  const second = trace.track("App Opened");

  await expect(first.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: submittedWith(losses) },
  });
  await expect(second.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: submittedWith(losses) },
  });
  expect(mock.sessions[0]?.events[0]?.context).toEqual({ screen: "home" });
  expect(mock.sessions[0]?.events[0]?.identity).toEqual({
    generation: 1,
    user: { id: "ada" },
    traits: { plan: "pro" },
    groups: { workspace: { id: "w_1", traits: { size: 3 } } },
  });
  expect(getter).not.toHaveBeenCalled();
});

test("the loss of a trait goes when the trait is removed, a group's losses go with its membership, and every loss goes when the user changes", async () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();
  trace.user({ id: "ada", traits: { sessionId: "s_1", token: "t_1" } });
  trace.group("workspace", { id: "w_1", traits: { apiKey: "k_1" } });
  trace.traits({ sessionId: null });

  await expect(trace.track("App Opened").settled).resolves.toMatchObject({
    outcomes: {
      product: submittedWith([
        { path: "traits.token", reason: "redacted" },
        { path: "groups.workspace.apiKey", reason: "redacted" },
      ]),
    },
  });

  trace.group("workspace", { id: "w_1", traits: { size: 3 } });

  await expect(trace.track("App Opened").settled).resolves.toMatchObject({
    outcomes: {
      product: submittedWith([
        { path: "traits.token", reason: "redacted" },
        { path: "groups.workspace.apiKey", reason: "redacted" },
      ]),
    },
  });

  trace.group("workspace", { id: "w_2" });

  await expect(trace.track("App Opened").settled).resolves.toMatchObject({
    outcomes: {
      product: submittedWith([{ path: "traits.token", reason: "redacted" }]),
    },
  });

  trace.user({ id: "bob" });

  await expect(trace.track("App Opened").settled).resolves.toMatchObject({
    outcomes: { product: submittedWith([]) },
  });
});

test("a redact that throws drops the event as sanitizer-failed, and nothing is sent", () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: {
      redact: (_, path) => {
        if (path === "context.screen") {
          throw new Error("redact exploded");
        }

        return false;
      },
    },
  });

  trace.start();

  const receipt = trace.track("App Opened", undefined, {
    context: { screen: "home" },
  });

  expect(receipt.status.get()).toEqual({
    state: "dropped",
    reason: "sanitizer-failed",
  });
  expect(mock.sessions[0]?.events).toEqual([]);
});

test("a scope whose context cannot be sanitized drops its events as sanitizer-failed", () => {
  let armed = true;
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: {
      redact: () => {
        if (armed) {
          throw new Error("redact exploded");
        }

        return false;
      },
    },
  });

  const scope = trace.scope({ context: { feature: "billing" } });

  armed = false;
  trace.start();

  expect(scope.track("App Opened").status.get()).toEqual({
    state: "dropped",
    reason: "sanitizer-failed",
  });
  expect(trace.track("App Opened").status.get()).toMatchObject({
    state: "settled",
  });
});

test("a scope whose context could not be prepared drops its events before their properties are sanitized", () => {
  let armed = true;
  const asked: string[] = [];

  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    privacy: {
      redact: (_, path) => {
        if (armed) {
          throw new Error("redact exploded");
        }

        asked.push(path);

        return false;
      },
    },
  });

  const scope = trace.scope({ context: { feature: "billing" } });

  armed = false;
  trace.start();

  expect(scope.track("Card Added", { brand: "visa" }).status.get()).toEqual({
    state: "dropped",
    reason: "sanitizer-failed",
  });
  expect(asked).toEqual([]);
});

test("a scope whose context could not be prepared still validates first, so properties the event refuses drop as invalid", () => {
  let armed = true;
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: {
      redact: () => {
        if (armed) {
          throw new Error("redact exploded");
        }

        return false;
      },
    },
  });

  const scope = trace.scope({ context: { feature: "billing" } });

  armed = false;
  trace.start();

  // @ts-expect-error A JavaScript caller can pass properties the event refuses.
  expect(scope.track("Card Added", "visa").status.get()).toEqual({
    state: "dropped",
    reason: "invalid",
    issues: [{ path: "", message: "Expected an object of event properties." }],
  });
  expect(mock.sessions[0]?.events).toEqual([]);
});

test("a redacted value never reaches a destination, a provider's identity call, a stream listener or a diagnostic", () => {
  const secret = "s3cr3t-value";
  const mock = createMockAdapter();
  const streamed: TrackedEvent[] = [];
  const recorded: unknown[] = [];
  const snapshots: unknown[] = [];

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    defaults: { context: { token: secret } },
  });

  trace.events.subscribe((tracked) => streamed.push(tracked));
  trace.diagnostics.events.subscribe((diagnostic) => {
    recorded.push(diagnostic);
    snapshots.push(trace.diagnostics.get());
  });
  trace.start();
  trace.user({ id: "ada", traits: { password: secret, plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { apiKey: secret } });
  trace.context({ secret });
  trace
    .scope({ context: { cookie: secret } })
    .track(
      "Card Added",
      { password: secret, card: { authorization: secret } },
      { context: { bearer: secret } },
    );

  const seen = JSON.stringify({
    sessions: mock.sessions,
    streamed,
    recorded,
    snapshots,
  });

  expect(streamed).toHaveLength(1);
  expect(mock.sessions[0]?.identity).toEqual([
    { kind: "identify", user: { id: "ada" } },
    { kind: "traits", user: { id: "ada" }, set: { plan: "pro" }, remove: [] },
    {
      kind: "group",
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: {} },
    },
  ]);
  expect(seen).not.toContain(secret);
});

test("redact is asked for every key with its dotted path", () => {
  const redact = vi.fn(() => false);

  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    defaults: { context: { app: { version: "2.4.0" } } },
    privacy: { redact },
  });

  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { size: 3 } });
  trace.context({ locale: "de" });
  trace.track(
    "Card Added",
    { card: { cvc: "123" } },
    { context: { screen: "home" } },
  );

  expect(redact.mock.calls).toEqual([
    ["app", "context.app"],
    ["version", "context.app.version"],
    ["plan", "traits.plan"],
    ["size", "groups.workspace.size"],
    ["locale", "context.locale"],
    ["card", "properties.card"],
    ["cvc", "properties.card.cvc"],
    ["screen", "context.screen"],
  ]);
});

test("limits bound properties, context and traits, and what they cut is a truncated loss", async () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: { limits: { stringLength: 5, depth: 2 } },
  });

  trace.start();
  trace.traits({ note: "abcdefgh" });

  const receipt = trace.track(
    "Card Added",
    { brand: "mastercard", nested: { deeper: { deepest: 1 } } },
    { context: { screen: "checkout" } },
  );

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      product: submittedWith([
        { path: "properties.brand", reason: "truncated" },
        { path: "properties.nested.deeper", reason: "truncated" },
        { path: "context.screen", reason: "truncated" },
        { path: "traits.note", reason: "truncated" },
      ]),
    },
  });
  expect(mock.sessions[0]?.events[0]).toMatchObject({
    properties: { brand: "maste", nested: {} },
    context: { screen: "check" },
    identity: { traits: { note: "abcde" } },
  });
});

test("the schema runs once, on what the caller gave, and never again on sanitized values", () => {
  const mock = createMockAdapter();
  const at = new Date(0);

  const parse = vi.fn((): ParseResult<Record<string, unknown>> => ({
    ok: true,
    properties: { at },
  }));

  const trace = new Trace({
    events: { "Order Placed": { parse } },
    destinations: { product: mock.adapter },
  });

  trace.start();
  trace.track("Order Placed", { at });

  expect(parse.mock.calls).toEqual([[{ at }]]);
  expect(mock.sessions[0]?.events[0]?.properties).toEqual({
    at: "1970-01-01T00:00:00.000Z",
  });
});

test("a removal of a key redact names never reaches a provider, and it still clears that key's loss", async () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();
  trace.user({ id: "ada", traits: { sessionId: "s_1", plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { apiKey: "k_1" } });

  await expect(trace.track("App Opened").settled).resolves.toMatchObject({
    outcomes: {
      product: submittedWith([
        { path: "traits.sessionId", reason: "redacted" },
        { path: "groups.workspace.apiKey", reason: "redacted" },
      ]),
    },
  });

  trace.traits({ sessionId: null, plan: null });
  trace.group("workspace", { id: "w_1", traits: { apiKey: null } });

  await expect(trace.track("App Opened").settled).resolves.toMatchObject({
    outcomes: { product: submittedWith([]) },
  });
  expect(mock.sessions[0]?.identity).toEqual([
    { kind: "identify", user: { id: "ada" } },
    { kind: "traits", user: { id: "ada" }, set: { plan: "pro" }, remove: [] },
    {
      kind: "group",
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: {} },
    },
    { kind: "traits", user: { id: "ada" }, set: {}, remove: ["plan"] },
  ]);
});

test("the losses of traits and groups set while anonymous still ride after a sign-in", async () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();
  trace.traits({ token: "t_1", plan: "pro" });
  trace.group("workspace", { id: "w_1", traits: { apiKey: "k_1" } });
  trace.user({ id: "ada" });

  await expect(trace.track("App Opened").settled).resolves.toMatchObject({
    outcomes: {
      product: submittedWith([
        { path: "traits.token", reason: "redacted" },
        { path: "groups.workspace.apiKey", reason: "redacted" },
      ]),
    },
  });
});

test("one call's traits are bounded as a whole, and the keys past the breadth are never applied", async () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: { limits: { breadth: 2 } },
  });

  trace.start();
  trace.traits({ a: 1, b: 2, c: 3 });

  await expect(trace.track("App Opened").settled).resolves.toMatchObject({
    outcomes: {
      product: submittedWith([{ path: "traits", reason: "truncated" }]),
    },
  });
  expect(mock.sessions[0]?.events[0]?.identity.traits).toEqual({ a: 1, b: 2 });
  expect(mock.sessions[0]?.identity).toEqual([
    { kind: "traits", user: null, set: { a: 1, b: 2 }, remove: [] },
  ]);
});

test("traits accumulated within a generation stay within the total size, and a trait that no longer fits is never applied", async () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: { limits: { totalSize: 60 } },
  });

  trace.start();
  trace.traits({ a: "x".repeat(40) });
  trace.traits({ b: "y".repeat(40) });

  await expect(trace.track("App Opened").settled).resolves.toMatchObject({
    outcomes: {
      product: submittedWith([{ path: "traits.b", reason: "truncated" }]),
    },
  });
  expect(mock.sessions[0]?.events[0]?.identity.traits).toEqual({
    a: "x".repeat(40),
  });
  expect(mock.sessions[0]?.identity).toEqual([
    { kind: "traits", user: null, set: { a: "x".repeat(40) }, remove: [] },
  ]);
});

test("a group's traits are bounded as a whole, per call and as they accumulate", async () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: { limits: { breadth: 2 } },
  });

  trace.start();
  trace.group("workspace", { id: "w_1", traits: { a: 1, b: 2, c: 3 } });
  trace.group("workspace", { id: "w_1", traits: { d: 4 } });

  await expect(trace.track("App Opened").settled).resolves.toMatchObject({
    outcomes: {
      product: submittedWith([
        { path: "groups.workspace", reason: "truncated" },
      ]),
    },
  });
  expect(mock.sessions[0]?.events[0]?.identity.groups).toEqual({
    workspace: { id: "w_1", traits: { a: 1, b: 2 } },
  });
});

test("each loss list on a receipt stays within the breadth, with one truncated loss for what it leaves out", async () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: { limits: { breadth: 2 } },
  });

  trace.start();
  trace.traits({ token: "t_1" });
  trace.traits({ secret: "s_1" });
  trace.traits({ password: "p_1" });
  trace.group("workspace", { id: "w_1", traits: { apiKey: "k_1" } });
  trace.group("workspace", { id: "w_1", traits: { cookie: "c_1" } });
  trace.group("workspace", { id: "w_1", traits: { bearer: "b_1" } });

  const receipt = trace.track(
    "Card Added",
    { a: { token: "t_1", secret: "s_1" }, b: { password: "p_1" } },
    {
      context: {
        auth: { jwt: "j_1", bearer: "b_1" },
        session: { sessionId: "s_1" },
      },
    },
  );

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      product: submittedWith([
        { path: "properties.a.token", reason: "redacted" },
        { path: "properties.a.secret", reason: "redacted" },
        { path: "properties", reason: "truncated" },
        { path: "context.auth.jwt", reason: "redacted" },
        { path: "context.auth.bearer", reason: "redacted" },
        { path: "context", reason: "truncated" },
        { path: "traits.token", reason: "redacted" },
        { path: "traits.secret", reason: "redacted" },
        { path: "traits", reason: "truncated" },
        { path: "groups.workspace.apiKey", reason: "redacted" },
        { path: "groups.workspace.cookie", reason: "redacted" },
        { path: "groups.workspace", reason: "truncated" },
      ]),
    },
  });
});

test("leaving a group takes its losses with it", async () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();
  trace.group("workspace", { id: "w_1", traits: { apiKey: "k_1" } });
  trace.group("workspace", null);

  await expect(trace.track("App Opened").settled).resolves.toMatchObject({
    outcomes: { product: submittedWith([]) },
  });
});

test("a trait that grows past the total size is left as it was and reported, and no other trait is removed", async () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: { limits: { totalSize: 80 } },
  });

  trace.start();
  trace.traits({ a: "x".repeat(10) });
  trace.traits({ b: "y".repeat(10) });
  trace.traits({ a: "z".repeat(60) });

  await expect(trace.track("App Opened").settled).resolves.toMatchObject({
    outcomes: {
      product: submittedWith([{ path: "traits.a", reason: "truncated" }]),
    },
  });
  expect(mock.sessions[0]?.events[0]?.identity.traits).toEqual({
    a: "x".repeat(10),
    b: "y".repeat(10),
  });
  expect(mock.sessions[0]?.identity).toEqual([
    { kind: "traits", user: null, set: { a: "x".repeat(10) }, remove: [] },
    { kind: "traits", user: null, set: { b: "y".repeat(10) }, remove: [] },
  ]);
});
