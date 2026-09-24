import { expect, test } from "vitest";

import { getRudderStackTraits } from "src/utils/getRudderStackTraits";

test("text, numbers and booleans make one complete update", () => {
  expect(
    getRudderStackTraits({
      user: { id: "ada" },
      set: { plan: "pro", seats: 4, trial: false, note: "" },
      remove: [],
    }),
  ).toStrictEqual({
    traits: { plan: "pro", seats: 4, trial: false, note: "" },
    isComplete: true,
  });
});

test("a removal is sent as null and leaves the update incomplete, because RudderStack never sends a null", () => {
  expect(
    getRudderStackTraits({
      user: { id: "ada" },
      set: { plan: "pro" },
      remove: ["role", "seats"],
    }),
  ).toStrictEqual({
    traits: { role: null, seats: null, plan: "pro" },
    isComplete: false,
  });
});

test("an object or a list is left out and leaves the update incomplete, because RudderStack would merge it into the value it holds", () => {
  expect(
    getRudderStackTraits({
      user: null,
      set: {
        plan: "pro",
        address: { city: "Kyiv" },
        tags: ["new"],
        empty: {},
      },
      remove: [],
    }),
  ).toStrictEqual({ traits: { plan: "pro" }, isComplete: false });
});

test("an update of nested values alone leaves nothing to send", () => {
  expect(
    getRudderStackTraits({
      user: null,
      set: { address: { city: "Kyiv" } },
      remove: [],
    }),
  ).toStrictEqual({ traits: {}, isComplete: false });
});
