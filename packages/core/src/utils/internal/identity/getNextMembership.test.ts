import { expect, test } from "vitest";

import { getNextMembership } from "src/utils/internal/identity/getNextMembership";

test("leaving answers null, whatever was held", () => {
  expect(getNextMembership({ id: "w_1", traits: {} }, null)).toBeNull();
  expect(getNextMembership(undefined, null)).toBeNull();
});

test("a membership for another id, or with nothing held, starts fresh from a frozen copy of its traits", () => {
  const traits = { plan: "team" };

  for (const held of [undefined, null, { id: "w_1", traits: { seats: 3 } }]) {
    const next = getNextMembership(held, { id: "w_2", traits });

    expect(next).toEqual({ id: "w_2", traits: { plan: "team" } });
    expect(next?.traits).not.toBe(traits);
    expect([next, next?.traits].map(Object.isFrozen)).toEqual([true, true]);
  }
});

test("the same id with nothing changed answers the held membership itself", () => {
  const held = { id: "w_1", traits: { plan: "team", seats: 3 } };

  expect(getNextMembership(held, { id: "w_1", traits: { seats: 3 } })).toBe(
    held,
  );
});

test("the same id with changed traits merges them over the held ones, a null staying as a tombstone", () => {
  const next = getNextMembership(
    { id: "w_1", traits: { plan: "team", seats: 3 } },
    { id: "w_1", traits: { seats: 4, plan: null } },
  );

  expect(next).toEqual({ id: "w_1", traits: { plan: null, seats: 4 } });
  expect([next, next?.traits].map(Object.isFrozen)).toEqual([true, true]);
});
