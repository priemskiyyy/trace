import { Identify } from "@amplitude/analytics-browser";
import { TraceError } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { createIdentify } from "src/utils/createIdentify";

test("an update is an unset for each removed key and a set for each value, and refuses nothing", () => {
  const { identify, refusal } = createIdentify(
    Identify,
    "traits",
    { plan: "pro", seats: 12, trial: true, profile: { role: "owner" } },
    ["legacy"],
  );

  expect(identify.getUserProperties()).toStrictEqual({
    $unset: { legacy: "-" },
    $set: { plan: "pro", seats: 12, trial: true, profile: { role: "owner" } },
  });
  expect(refusal).toBe(null);
});

test("a value set to null is an unset, which is how a removed group trait arrives", () => {
  const { identify, refusal } = createIdentify(
    Identify,
    "group.workspace",
    { tier: null, seats: 3 },
    [],
  );

  expect(identify.getUserProperties()).toStrictEqual({
    $unset: { tier: "-" },
    $set: { seats: 3 },
  });
  expect(refusal).toBe(null);
});

test("a value Amplitude cannot take is left out whole, a null nested in a value is stripped, the rest is set, and the refusal names every path under the update's own", () => {
  const { identify, refusal } = createIdentify(
    Identify,
    "group.workspace",
    { tags: [null, "beta", false], profile: { score: null }, seats: 3 },
    [],
  );

  expect(identify.getUserProperties()).toStrictEqual({
    $set: { profile: {}, seats: 3 },
  });
  expect(refusal).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Amplitude cannot take these values, so they were left out: group.workspace.tags, group.workspace.profile.score.",
    }),
  );
});

test("a trait holding a string Amplitude would cut is left out whole, never sent with only that string removed", () => {
  const { identify, refusal } = createIdentify(
    Identify,
    "traits",
    { profile: { bio: "b".repeat(1_025), name: "ada" }, plan: "pro" },
    [],
  );

  expect(identify.getUserProperties()).toStrictEqual({
    $set: { plan: "pro" },
  });
  expect(refusal).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Amplitude cannot take these values, so they were left out: traits.profile.",
    }),
  );
});

test("a trait holding more than 1,000 keys is left out whole and named", () => {
  const big = Object.fromEntries(
    Array.from({ length: 1_001 }, (_, index) => [`k${index}`, index]),
  );

  const { identify, refusal } = createIdentify(
    Identify,
    "traits",
    { big, plan: "pro" },
    [],
  );

  expect(identify.getUserProperties()).toStrictEqual({
    $set: { plan: "pro" },
  });
  expect(refusal).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Amplitude cannot take these values, so they were left out: traits.big.",
    }),
  );
});
