import { expect, test, vi } from "vitest";

import { IdentityState } from "src/utils/internal/identity/IdentityState";

const isDeepFrozen = (value: unknown): boolean =>
  typeof value !== "object" ||
  value === null ||
  (Object.isFrozen(value) && Object.values(value).every(isDeepFrozen));

test("an identity starts anonymous at generation zero with nothing in it", () => {
  const identity = new IdentityState();

  expect(identity.target.get()).toStrictEqual({
    generation: 0,
    user: null,
    traits: {},
    groups: {},
  });
  expect(isDeepFrozen(identity.target.get())).toBe(true);
});

test("signing in starts a generation and keeps what was set while anonymous, removals included", () => {
  const identity = new IdentityState();

  identity.setTraits({ plan: "free", role: null });
  identity.setGroup("workspace", { id: "w_1", traits: { seats: 3 } });
  identity.setGroup("team", null);

  expect(identity.setUser({ id: "ada", traits: { seats: 2 } })).toStrictEqual({
    kind: "CHANGED",
    ended: false,
  });
  expect(identity.target.get()).toStrictEqual({
    generation: 1,
    user: { id: "ada" },
    traits: { plan: "free", role: null, seats: 2 },
    groups: { workspace: { id: "w_1", traits: { seats: 3 } }, team: null },
  });
});

test("the same user again merges its traits and stays in its generation", () => {
  const identity = new IdentityState();

  identity.setUser({ id: "ada", traits: { plan: "free", role: "admin" } });

  expect(
    identity.setUser({ id: "ada", traits: { plan: "pro", role: null } }),
  ).toStrictEqual({ kind: "UNCHANGED" });
  expect(identity.target.get()).toStrictEqual({
    generation: 1,
    user: { id: "ada" },
    traits: { plan: "pro", role: null },
    groups: {},
  });
});

test("another user starts a generation that drops the previous user's traits and groups, then takes the new user's traits", () => {
  const identity = new IdentityState();

  identity.setUser({ id: "ada", traits: { plan: "pro", role: null } });
  identity.setGroup("workspace", { id: "w_1", traits: { seats: 3 } });

  expect(
    identity.setUser({ id: "bob", traits: { plan: "free" } }),
  ).toStrictEqual({ kind: "CHANGED", ended: true });
  expect(identity.target.get()).toStrictEqual({
    generation: 2,
    user: { id: "bob" },
    traits: { plan: "free" },
    groups: {},
  });
});

test("signing out starts an anonymous generation with nothing in it", () => {
  const identity = new IdentityState();

  identity.setUser({ id: "ada", traits: { plan: "pro" } });
  identity.setGroup("workspace", { id: "w_1", traits: {} });

  expect(identity.setUser(null)).toStrictEqual({
    kind: "CHANGED",
    ended: true,
  });
  expect(identity.target.get()).toStrictEqual({
    generation: 2,
    user: null,
    traits: {},
    groups: {},
  });
});

test("signing out while anonymous changes nothing, so a repeated sign-out never starts a generation", () => {
  const identity = new IdentityState();

  identity.setTraits({ plan: "free" });

  const before = identity.target.get();
  const listener = vi.fn();

  identity.target.subscribe(listener);

  expect(identity.setUser(null)).toStrictEqual({ kind: "UNCHANGED" });
  expect(identity.setUser(null)).toStrictEqual({ kind: "UNCHANGED" });
  expect(identity.target.get()).toBe(before);
  expect(listener).not.toHaveBeenCalled();
});

test("the generation grows once for each change of user and never otherwise", () => {
  const identity = new IdentityState();
  const generations: number[] = [];

  for (const user of [
    { id: "ada", traits: {} },
    { id: "ada", traits: { plan: "pro" } },
    { id: "bob", traits: {} },
    null,
    null,
    { id: "ada", traits: {} },
  ]) {
    identity.setUser(user);
    generations.push(identity.target.get().generation);
  }

  expect(generations).toStrictEqual([1, 1, 2, 3, 3, 4]);
});

test("traits merge, and a null leaves a tombstone, even for a trait never set", () => {
  const identity = new IdentityState();

  identity.setTraits({ plan: "free", role: "admin" });
  identity.setTraits({ plan: "pro", role: null, seats: null });

  expect(identity.target.get().traits).toStrictEqual({
    plan: "pro",
    role: null,
    seats: null,
  });
});

test("traits that change nothing keep the same target and notify nobody", () => {
  const identity = new IdentityState();

  identity.setTraits({ plan: "pro", role: null });

  const before = identity.target.get();
  const listener = vi.fn();

  identity.target.subscribe(listener);

  identity.setTraits({});
  identity.setTraits({ plan: "pro" });
  identity.setTraits({ role: null });

  expect(identity.target.get()).toBe(before);
  expect(listener).not.toHaveBeenCalled();
});

test("joining a group sets its membership", () => {
  const identity = new IdentityState();

  identity.setGroup("workspace", { id: "w_1", traits: { seats: 3 } });

  expect(identity.target.get().groups).toStrictEqual({
    workspace: { id: "w_1", traits: { seats: 3 } },
  });
});

test("the same group id merges its traits, and a null leaves a tombstone for a group trait", () => {
  const identity = new IdentityState();

  identity.setGroup("workspace", {
    id: "w_1",
    traits: { seats: 3, plan: "pro" },
  });

  identity.setGroup("workspace", {
    id: "w_1",
    traits: { plan: null, region: "eu" },
  });

  expect(identity.target.get().groups).toStrictEqual({
    workspace: { id: "w_1", traits: { seats: 3, plan: null, region: "eu" } },
  });
});

test("a different group id replaces the membership, and its traits start fresh", () => {
  const identity = new IdentityState();

  identity.setGroup("workspace", {
    id: "w_1",
    traits: { seats: 3, plan: "pro" },
  });

  identity.setGroup("workspace", { id: "w_2", traits: { region: "eu" } });

  expect(identity.target.get().groups).toStrictEqual({
    workspace: { id: "w_2", traits: { region: "eu" } },
  });
});

test("leaving a group leaves a tombstone, even for a group never joined, and joining again starts fresh", () => {
  const identity = new IdentityState();

  identity.setGroup("workspace", { id: "w_1", traits: { seats: 3 } });

  identity.setGroup("workspace", null);
  identity.setGroup("team", null);

  expect(identity.target.get().groups).toStrictEqual({
    workspace: null,
    team: null,
  });

  identity.setGroup("workspace", { id: "w_1", traits: {} });

  expect(identity.target.get().groups).toStrictEqual({
    workspace: { id: "w_1", traits: {} },
    team: null,
  });
});

test("a group call that changes nothing keeps the same target and notifies nobody", () => {
  const identity = new IdentityState();

  identity.setGroup("workspace", { id: "w_1", traits: { seats: 3 } });
  identity.setGroup("team", null);

  const before = identity.target.get();
  const listener = vi.fn();

  identity.target.subscribe(listener);

  identity.setGroup("workspace", { id: "w_1", traits: { seats: 3 } });
  identity.setGroup("workspace", { id: "w_1", traits: {} });
  identity.setGroup("team", null);

  expect(identity.target.get()).toBe(before);
  expect(listener).not.toHaveBeenCalled();
});

test("the snapshot hides tombstones and is the same object until the target changes", () => {
  const identity = new IdentityState();

  identity.setUser({ id: "ada", traits: { plan: "pro", role: null } });
  identity.setGroup("workspace", {
    id: "w_1",
    traits: { seats: 3, region: null },
  });
  identity.setGroup("team", null);

  const snapshot = identity.snapshot();

  expect(snapshot).toStrictEqual({
    generation: 1,
    user: { id: "ada" },
    traits: { plan: "pro" },
    groups: { workspace: { id: "w_1", traits: { seats: 3 } } },
  });
  expect(isDeepFrozen(snapshot)).toBe(true);
  expect(identity.snapshot()).toBe(snapshot);

  identity.setTraits({ plan: "pro" });

  expect(identity.snapshot()).toBe(snapshot);

  identity.setTraits({ seats: 2 });

  expect(identity.snapshot()).not.toBe(snapshot);
  expect(identity.snapshot().traits).toStrictEqual({ plan: "pro", seats: 2 });
});

test("every target is frozen down to its group traits, and the caller's objects are neither frozen nor kept", () => {
  const identity = new IdentityState();
  const user = { id: "ada", traits: { plan: "pro" } };
  const group = { id: "w_1", traits: { seats: 3 } };

  identity.setUser(user);
  identity.setGroup("workspace", group);
  user.traits.plan = "free";
  group.traits.seats = 4;

  expect(isDeepFrozen(identity.target.get())).toBe(true);
  expect([user, user.traits, group, group.traits].some(Object.isFrozen)).toBe(
    false,
  );
  expect(identity.target.get()).toStrictEqual({
    generation: 1,
    user: { id: "ada" },
    traits: { plan: "pro" },
    groups: { workspace: { id: "w_1", traits: { seats: 3 } } },
  });
});

test("each change replaces the target once and tells its listeners", () => {
  const identity = new IdentityState();
  const seen: number[] = [];

  identity.target.subscribe(() =>
    seen.push(Object.keys(identity.target.get().traits).length),
  );
  identity.setTraits({ plan: "pro" });
  identity.setGroup("workspace", { id: "w_1", traits: {} });
  identity.setUser({ id: "ada", traits: { seats: 3 } });
  identity.setUser({ id: "ada", traits: { role: null } });
  identity.setUser(null);

  expect(seen).toStrictEqual([1, 1, 2, 3, 0]);
});
