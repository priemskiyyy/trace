import { expect, test } from "vitest";

import type { IdentityStep } from "src/types/internal/IdentityStep";
import type { IdentityTarget } from "src/types/internal/IdentityTarget";
import type { SessionIdentityMethods } from "src/types/internal/SessionIdentityMethods";
import { planIdentity } from "src/utils/internal/identity/planIdentity";

type Case = {
  name: string;
  applied: IdentityTarget | null;
  target: IdentityTarget;
  session: SessionIdentityMethods;
  steps: IdentityStep[];
  next: IdentityTarget;
};

const all: SessionIdentityMethods = {
  identify: true,
  traits: true,
  group: true,
  reset: true,
};

const traitsAndGroupOnly: SessionIdentityMethods = {
  identify: false,
  traits: true,
  group: true,
  reset: false,
};

const none: SessionIdentityMethods = {
  identify: false,
  traits: false,
  group: false,
  reset: false,
};

const ada = { id: "ada" };
const bob = { id: "bob" };

const identity = (overrides: Partial<IdentityTarget> = {}): IdentityTarget => ({
  generation: 0,
  user: null,
  traits: {},
  groups: {},
  ...overrides,
});

const isDeepFrozen = (value: unknown): boolean =>
  typeof value !== "object" ||
  value === null ||
  (Object.isFrozen(value) && Object.values(value).every(isDeepFrozen));

const isAnyFrozen = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (Object.isFrozen(value) || Object.values(value).some(isAnyFrozen));

const everything = () =>
  identity({
    generation: 1,
    user: { id: "ada" },
    traits: { plan: "pro", role: null },
    groups: {
      workspace: { id: "w_1", traits: { seats: 3, region: null } },
      team: null,
    },
  });

const cases: Case[] = [
  {
    name: "a fresh session and an anonymous target with traits",
    applied: identity(),
    target: identity({ traits: { plan: "free" } }),
    session: all,
    steps: [{ kind: "traits", user: null, set: { plan: "free" }, remove: [] }],
    next: identity({ traits: { plan: "free" } }),
  },
  {
    name: "a fresh session and a user",
    applied: identity(),
    target: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
    session: all,
    steps: [
      { kind: "identify", user: ada },
      { kind: "traits", user: ada, set: { plan: "pro" }, remove: [] },
    ],
    next: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
  },
  {
    name: "the same user with one changed trait",
    applied: identity({
      generation: 1,
      user: ada,
      traits: { plan: "free", seats: 2 },
    }),
    target: identity({
      generation: 1,
      user: ada,
      traits: { plan: "pro", seats: 2 },
    }),
    session: all,
    steps: [{ kind: "traits", user: ada, set: { plan: "pro" }, remove: [] }],
    next: identity({
      generation: 1,
      user: ada,
      traits: { plan: "pro", seats: 2 },
    }),
  },
  {
    name: "a removal the provider may hold from an earlier session",
    applied: identity({ generation: 1, user: ada }),
    target: identity({ generation: 1, user: ada, traits: { role: null } }),
    session: all,
    steps: [{ kind: "traits", user: ada, set: {}, remove: ["role"] }],
    next: identity({ generation: 1, user: ada, traits: { role: null } }),
  },
  {
    name: "a removal already sent",
    applied: identity({ generation: 1, user: ada, traits: { role: null } }),
    target: identity({ generation: 1, user: ada, traits: { role: null } }),
    session: all,
    steps: [],
    next: identity({ generation: 1, user: ada, traits: { role: null } }),
  },
  {
    name: "anonymous to a user on a stateful provider",
    applied: identity({ traits: { plan: "free" } }),
    target: identity({ generation: 1, user: ada, traits: { plan: "free" } }),
    session: all,
    steps: [{ kind: "identify", user: ada }],
    next: identity({ generation: 1, user: ada, traits: { plan: "free" } }),
  },
  {
    name: "a user switch on a stateful provider",
    applied: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
    target: identity({ generation: 2, user: bob, traits: { plan: "free" } }),
    session: all,
    steps: [
      { kind: "reset" },
      { kind: "identify", user: bob },
      { kind: "traits", user: bob, set: { plan: "free" }, remove: [] },
    ],
    next: identity({ generation: 2, user: bob, traits: { plan: "free" } }),
  },
  {
    name: "a sign-out on a stateful provider",
    applied: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
    target: identity({ generation: 2 }),
    session: all,
    steps: [{ kind: "reset" }],
    next: identity({ generation: 2 }),
  },
  {
    name: "a user switch on a stateless provider",
    applied: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
    target: identity({ generation: 2, user: bob, traits: { plan: "free" } }),
    session: traitsAndGroupOnly,
    steps: [{ kind: "traits", user: bob, set: { plan: "free" }, remove: [] }],
    next: identity({ generation: 2, user: bob, traits: { plan: "free" } }),
  },
  {
    name: "anonymous to a user on a stateless provider",
    applied: identity({ traits: { plan: "free" } }),
    target: identity({ generation: 1, user: ada, traits: { plan: "free" } }),
    session: traitsAndGroupOnly,
    steps: [{ kind: "traits", user: ada, set: { plan: "free" }, remove: [] }],
    next: identity({ generation: 1, user: ada, traits: { plan: "free" } }),
  },
  {
    name: "an unknown provider state, stateful",
    applied: null,
    target: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
    session: all,
    steps: [
      { kind: "reset" },
      { kind: "identify", user: ada },
      { kind: "traits", user: ada, set: { plan: "pro" }, remove: [] },
    ],
    next: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
  },
  {
    name: "an unknown provider state, stateless",
    applied: null,
    target: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
    session: traitsAndGroupOnly,
    steps: [{ kind: "traits", user: ada, set: { plan: "pro" }, remove: [] }],
    next: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
  },
  {
    name: "a session with no identity methods",
    applied: identity(),
    target: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
    session: none,
    steps: [],
    next: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
  },
  {
    name: "joining a group",
    applied: identity({ generation: 1, user: ada }),
    target: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_1", traits: { seats: 3 } } },
    }),
    session: all,
    steps: [
      {
        kind: "group",
        user: ada,
        group: { type: "workspace", id: "w_1", traits: { seats: 3 } },
      },
    ],
    next: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_1", traits: { seats: 3 } } },
    }),
  },
  {
    name: "moving to another group",
    applied: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_1", traits: {} } },
    }),
    target: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_2", traits: {} } },
    }),
    session: all,
    steps: [
      {
        kind: "group",
        user: ada,
        group: { type: "workspace", id: "w_2", traits: {} },
      },
    ],
    next: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_2", traits: {} } },
    }),
  },
  {
    name: "moving to another group leaves the previous group's traits behind",
    applied: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_1", traits: { plan: "pro" } } },
    }),
    target: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_2", traits: { seats: 3 } } },
    }),
    session: all,
    steps: [
      {
        kind: "group",
        user: ada,
        group: { type: "workspace", id: "w_2", traits: { seats: 3 } },
      },
    ],
    next: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_2", traits: { seats: 3 } } },
    }),
  },
  {
    name: "leaving a group the provider may hold",
    applied: identity({ generation: 1, user: ada }),
    target: identity({ generation: 1, user: ada, groups: { workspace: null } }),
    session: all,
    steps: [
      {
        kind: "group",
        user: ada,
        group: { type: "workspace", id: null, traits: {} },
      },
    ],
    next: identity({ generation: 1, user: ada, groups: { workspace: null } }),
  },
  {
    name: "a removed group trait",
    applied: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_1", traits: { plan: "pro" } } },
    }),
    target: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_1", traits: { plan: null } } },
    }),
    session: all,
    steps: [
      {
        kind: "group",
        user: ada,
        group: { type: "workspace", id: "w_1", traits: { plan: null } },
      },
    ],
    next: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_1", traits: { plan: null } } },
    }),
  },
  {
    name: "an identity the provider already holds",
    applied: everything(),
    target: everything(),
    session: all,
    steps: [],
    next: everything(),
  },
  {
    name: "leaving a group the provider holds",
    applied: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_1", traits: { seats: 3 } } },
    }),
    target: identity({ generation: 1, user: ada, groups: { workspace: null } }),
    session: all,
    steps: [
      {
        kind: "group",
        user: ada,
        group: { type: "workspace", id: null, traits: {} },
      },
    ],
    next: identity({ generation: 1, user: ada, groups: { workspace: null } }),
  },
  {
    name: "a changed group trait sends every trait of the membership, removals included",
    applied: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_1", traits: { plan: "pro", seats: 2 } } },
    }),
    target: identity({
      generation: 1,
      user: ada,
      groups: {
        workspace: {
          id: "w_1",
          traits: { plan: "pro", seats: 3, region: null },
        },
      },
    }),
    session: all,
    steps: [
      {
        kind: "group",
        user: ada,
        group: {
          type: "workspace",
          id: "w_1",
          traits: { plan: "pro", seats: 3, region: null },
        },
      },
    ],
    next: identity({
      generation: 1,
      user: ada,
      groups: {
        workspace: {
          id: "w_1",
          traits: { plan: "pro", seats: 3, region: null },
        },
      },
    }),
  },
  {
    name: "several groups in the order of the target's keys",
    applied: identity({ generation: 1, user: ada }),
    target: identity({
      generation: 1,
      user: ada,
      groups: {
        workspace: { id: "w_1", traits: {} },
        team: null,
        company: { id: "c_1", traits: {} },
      },
    }),
    session: all,
    steps: [
      {
        kind: "group",
        user: ada,
        group: { type: "workspace", id: "w_1", traits: {} },
      },
      {
        kind: "group",
        user: ada,
        group: { type: "team", id: null, traits: {} },
      },
      {
        kind: "group",
        user: ada,
        group: { type: "company", id: "c_1", traits: {} },
      },
    ],
    next: identity({
      generation: 1,
      user: ada,
      groups: {
        workspace: { id: "w_1", traits: {} },
        team: null,
        company: { id: "c_1", traits: {} },
      },
    }),
  },
  {
    name: "a membership keeps the traits the provider holds that the target does not name",
    applied: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_1", traits: { plan: "pro" } } },
    }),
    target: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_1", traits: {} } },
    }),
    session: all,
    steps: [],
    next: identity({
      generation: 1,
      user: ada,
      groups: { workspace: { id: "w_1", traits: { plan: "pro" } } },
    }),
  },
  {
    name: "the same user at the same generation leaves what the target does not name as the provider holds it",
    applied: identity({
      generation: 1,
      user: ada,
      traits: { plan: "pro" },
      groups: { workspace: { id: "w_1", traits: {} } },
    }),
    target: identity({ generation: 1, user: ada }),
    session: all,
    steps: [],
    next: identity({
      generation: 1,
      user: ada,
      traits: { plan: "pro" },
      groups: { workspace: { id: "w_1", traits: {} } },
    }),
  },
  {
    name: "the same user one generation later resets first",
    applied: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
    target: identity({ generation: 2, user: ada, traits: { plan: "pro" } }),
    session: all,
    steps: [
      { kind: "reset" },
      { kind: "identify", user: ada },
      { kind: "traits", user: ada, set: { plan: "pro" }, remove: [] },
    ],
    next: identity({ generation: 2, user: ada, traits: { plan: "pro" } }),
  },
  {
    name: "the same user two generations later resets first",
    applied: identity({
      generation: 1,
      user: ada,
      traits: { plan: "pro" },
      groups: { workspace: { id: "w_1", traits: {} } },
    }),
    target: identity({
      generation: 3,
      user: ada,
      traits: { plan: "pro", role: "admin" },
      groups: { team: { id: "t_1", traits: {} } },
    }),
    session: all,
    steps: [
      { kind: "reset" },
      { kind: "identify", user: ada },
      {
        kind: "traits",
        user: ada,
        set: { plan: "pro", role: "admin" },
        remove: [],
      },
      {
        kind: "group",
        user: ada,
        group: { type: "team", id: "t_1", traits: {} },
      },
    ],
    next: identity({
      generation: 3,
      user: ada,
      traits: { plan: "pro", role: "admin" },
      groups: { team: { id: "t_1", traits: {} } },
    }),
  },
  {
    name: "the same user two generations later on a session without reset sends the whole target again",
    applied: identity({
      generation: 1,
      user: ada,
      traits: { plan: "pro" },
      groups: { workspace: { id: "w_1", traits: {} } },
    }),
    target: identity({
      generation: 3,
      user: ada,
      traits: { plan: "pro", role: "admin" },
      groups: { team: { id: "t_1", traits: {} } },
    }),
    session: { identify: true, traits: true, group: true, reset: false },
    steps: [
      { kind: "identify", user: ada },
      {
        kind: "traits",
        user: ada,
        set: { plan: "pro", role: "admin" },
        remove: [],
      },
      {
        kind: "group",
        user: ada,
        group: { type: "team", id: "t_1", traits: {} },
      },
    ],
    next: identity({
      generation: 3,
      user: ada,
      traits: { plan: "pro", role: "admin" },
      groups: { team: { id: "t_1", traits: {} } },
    }),
  },
  {
    name: "the same user one generation earlier resets first",
    applied: identity({ generation: 2, user: ada, traits: { plan: "pro" } }),
    target: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
    session: all,
    steps: [
      { kind: "reset" },
      { kind: "identify", user: ada },
      { kind: "traits", user: ada, set: { plan: "pro" }, remove: [] },
    ],
    next: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
  },
  {
    name: "a different user at the same generation resets first",
    applied: identity({ generation: 2, user: ada, traits: { plan: "pro" } }),
    target: identity({ generation: 2, user: bob, traits: { plan: "pro" } }),
    session: all,
    steps: [
      { kind: "reset" },
      { kind: "identify", user: bob },
      { kind: "traits", user: bob, set: { plan: "pro" }, remove: [] },
    ],
    next: identity({ generation: 2, user: bob, traits: { plan: "pro" } }),
  },
  {
    name: "a user switch on a stateful provider sends again what the next user shares",
    applied: identity({
      generation: 1,
      user: ada,
      traits: { plan: "pro" },
      groups: { workspace: { id: "w_1", traits: {} } },
    }),
    target: identity({
      generation: 2,
      user: bob,
      traits: { plan: "pro" },
      groups: { workspace: { id: "w_1", traits: {} } },
    }),
    session: all,
    steps: [
      { kind: "reset" },
      { kind: "identify", user: bob },
      { kind: "traits", user: bob, set: { plan: "pro" }, remove: [] },
      {
        kind: "group",
        user: bob,
        group: { type: "workspace", id: "w_1", traits: {} },
      },
    ],
    next: identity({
      generation: 2,
      user: bob,
      traits: { plan: "pro" },
      groups: { workspace: { id: "w_1", traits: {} } },
    }),
  },
  {
    name: "a sign-out on a stateful provider followed by anonymous traits",
    applied: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
    target: identity({ generation: 2, traits: { plan: "free" } }),
    session: all,
    steps: [
      { kind: "reset" },
      { kind: "traits", user: null, set: { plan: "free" }, remove: [] },
    ],
    next: identity({ generation: 2, traits: { plan: "free" } }),
  },
  {
    name: "a sign-out on a stateless provider",
    applied: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
    target: identity({ generation: 2 }),
    session: traitsAndGroupOnly,
    steps: [],
    next: identity({ generation: 2 }),
  },
  {
    name: "an unknown provider state and an anonymous target on a stateful provider",
    applied: null,
    target: identity(),
    session: all,
    steps: [{ kind: "reset" }],
    next: identity(),
  },
  {
    name: "an unknown provider state sends every removal again",
    applied: null,
    target: everything(),
    session: all,
    steps: [
      { kind: "reset" },
      { kind: "identify", user: ada },
      { kind: "traits", user: ada, set: { plan: "pro" }, remove: ["role"] },
      {
        kind: "group",
        user: ada,
        group: {
          type: "workspace",
          id: "w_1",
          traits: { seats: 3, region: null },
        },
      },
      {
        kind: "group",
        user: ada,
        group: { type: "team", id: null, traits: {} },
      },
    ],
    next: everything(),
  },
  {
    name: "a session without traits or group methods sends neither, whatever the target holds",
    applied: identity({ generation: 1, user: ada }),
    target: everything(),
    session: { identify: true, traits: false, group: false, reset: true },
    steps: [],
    next: everything(),
  },
  {
    name: "a session that can only identify",
    applied: identity({ generation: 1, user: ada, traits: { plan: "pro" } }),
    target: identity({ generation: 2, user: bob, traits: { plan: "free" } }),
    session: { identify: true, traits: false, group: false, reset: false },
    steps: [{ kind: "identify", user: bob }],
    next: identity({ generation: 2, user: bob, traits: { plan: "free" } }),
  },
  {
    name: "anonymous to a user past a switch this provider never saw resets first",
    applied: identity({ traits: { plan: "free" } }),
    target: identity({ generation: 2, user: ada, traits: { plan: "free" } }),
    session: all,
    steps: [
      { kind: "reset" },
      { kind: "identify", user: ada },
      { kind: "traits", user: ada, set: { plan: "free" }, remove: [] },
    ],
    next: identity({ generation: 2, user: ada, traits: { plan: "free" } }),
  },
  {
    name: "anonymous to the same user again past a sign-out this provider never saw resets first",
    applied: identity({ traits: { plan: "free" } }),
    target: identity({ generation: 3, user: ada, traits: { plan: "free" } }),
    session: all,
    steps: [
      { kind: "reset" },
      { kind: "identify", user: ada },
      { kind: "traits", user: ada, set: { plan: "free" }, remove: [] },
    ],
    next: identity({ generation: 3, user: ada, traits: { plan: "free" } }),
  },
  {
    name: "anonymous to anonymous past a sign-in and a sign-out this provider never saw resets first",
    applied: identity({ traits: { plan: "free" } }),
    target: identity({ generation: 2, traits: { plan: "free" } }),
    session: all,
    steps: [
      { kind: "reset" },
      { kind: "traits", user: null, set: { plan: "free" }, remove: [] },
    ],
    next: identity({ generation: 2, traits: { plan: "free" } }),
  },
  {
    name: "an anonymous state newer than the target is never carried into the target's user",
    applied: identity({ generation: 3, traits: { plan: "free" } }),
    target: identity({ generation: 2, user: ada, traits: { plan: "free" } }),
    session: all,
    steps: [
      { kind: "reset" },
      { kind: "identify", user: ada },
      { kind: "traits", user: ada, set: { plan: "free" }, remove: [] },
    ],
    next: identity({ generation: 2, user: ada, traits: { plan: "free" } }),
  },
  {
    name: "a fresh session seeded blank at the target's own generation identifies without a reset",
    applied: identity({ generation: 2 }),
    target: identity({ generation: 2, user: ada, traits: { plan: "pro" } }),
    session: all,
    steps: [
      { kind: "identify", user: ada },
      { kind: "traits", user: ada, set: { plan: "pro" }, remove: [] },
    ],
    next: identity({ generation: 2, user: ada, traits: { plan: "pro" } }),
  },
  {
    name: "a user past a switch a stateless provider never saw needs no reset",
    applied: identity({ traits: { plan: "free" } }),
    target: identity({ generation: 2, user: ada, traits: { plan: "free" } }),
    session: traitsAndGroupOnly,
    steps: [{ kind: "traits", user: ada, set: { plan: "free" }, remove: [] }],
    next: identity({ generation: 2, user: ada, traits: { plan: "free" } }),
  },
];

test.each(cases.map((row): [string, Case] => [row.name, row]))(
  "planning %s",
  (_, { applied, target, session, steps, next }) => {
    expect(planIdentity(applied, target, session)).toStrictEqual({
      steps,
      next,
    });
  },
);

test.each([
  ["every identity method", all],
  ["traits and group only", traitsAndGroupOnly],
])(
  "a target planned once needs no step the second time, for a session with %s",
  (_, session) => {
    const { next } = planIdentity(null, everything(), session);

    expect(planIdentity(next, everything(), session).steps).toStrictEqual([]);
  },
);

test("planning neither changes nor freezes its inputs, answers the same plan every time, and freezes that plan", () => {
  const applied = identity({
    generation: 1,
    user: { id: "ada" },
    traits: { plan: "free", seats: 2 },
    groups: { workspace: { id: "w_1", traits: { plan: "pro" } }, team: null },
  });

  const target = identity({
    generation: 2,
    user: { id: "bob" },
    traits: { plan: "pro", role: null },
    groups: { workspace: { id: "w_1", traits: { plan: null } } },
  });

  const sameUser = identity({
    generation: 1,
    user: { id: "ada" },
    traits: { plan: "pro" },
    groups: { workspace: { id: "w_1", traits: { plan: "pro" } } },
  });

  const before = structuredClone({ applied, target, sameUser });

  for (const wanted of [target, sameUser]) {
    for (const session of [all, traitsAndGroupOnly, none]) {
      const plan = planIdentity(applied, wanted, session);

      expect(isDeepFrozen(plan)).toBe(true);
      expect(planIdentity(applied, wanted, session)).toStrictEqual(plan);
    }
  }

  expect(isDeepFrozen(planIdentity(null, target, all))).toBe(true);
  expect({ applied, target, sameUser }).toStrictEqual(before);
  expect(isAnyFrozen({ applied, target, sameUser })).toBe(false);
});
