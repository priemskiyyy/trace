import { expect, test } from "vitest";

import { getProfileUpdate } from "src/utils/getProfileUpdate";

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

test("values within Mixpanel's profile limits are set, a null is a removal, and the update is complete", () => {
  expect(
    getProfileUpdate({
      plan: "pro",
      seats: 4,
      $email: "ada@example.com",
      address: { city: "Lviv", street: null },
      tags: ["beta", "team"],
      role: null,
    }),
  ).toStrictEqual({
    set: {
      plan: "pro",
      seats: 4,
      $email: "ada@example.com",
      address: { city: "Lviv", street: null },
      tags: ["beta", "team"],
    },
    remove: ["role"],
    isComplete: true,
  });
});

test("ip and $ignore_time are left out, because the mixpanel Node client moves them into the request's own fields, and the update is incomplete", () => {
  expect(
    getProfileUpdate({
      ip: "203.0.113.7",
      $ignore_time: true,
      plan: "pro",
    }),
  ).toStrictEqual({ set: { plan: "pro" }, remove: [], isComplete: false });
});

test("a value Mixpanel would cut or refuse is left out whole, so no stored value is altered, and the update is incomplete", () => {
  expect(
    getProfileUpdate({
      bio: "x".repeat(256),
      settings: { a: { b: { c: { d: 1 } } } },
      ids: range(255),
      items: [{ sku: "sku_1", attributes: { color: "red" } }],
      labels: { ["k".repeat(256)]: 1 },
      kept: "x".repeat(255),
    }),
  ).toStrictEqual({
    set: { kept: "x".repeat(255) },
    remove: [],
    isComplete: false,
  });
});

test("a name longer than 255 characters is left out whole, because Mixpanel would cut it and file the value under another name, and the update is incomplete", () => {
  expect(
    getProfileUpdate({ ["n".repeat(256)]: "pro", ["n".repeat(255)]: "pro" }),
  ).toStrictEqual({
    set: { ["n".repeat(255)]: "pro" },
    remove: [],
    isComplete: false,
  });
});

test("a removal whose name is longer than 255 characters is left out, because Mixpanel would cut it and remove another property, and the update is incomplete", () => {
  expect(
    getProfileUpdate({
      role: null,
      ["n".repeat(256)]: null,
      ["n".repeat(255)]: null,
    }),
  ).toStrictEqual({
    set: {},
    remove: ["role", "n".repeat(255)],
    isComplete: false,
  });
});

test("a removal of ip or $ignore_time is kept, because the client moves those keys out of a set and never out of a removal", () => {
  expect(getProfileUpdate({ ip: null, $ignore_time: null })).toStrictEqual({
    set: {},
    remove: ["ip", "$ignore_time"],
    isComplete: true,
  });
});

test("a __proto__ name stays a key of its own", () => {
  const { set } = getProfileUpdate(
    Object.fromEntries([["__proto__", ["w_1"]]]),
  );

  expect(set).toStrictEqual(Object.fromEntries([["__proto__", ["w_1"]]]));
  expect(Object.getPrototypeOf(set)).toBe(Object.prototype);
});

test("a list or object of exactly 256,000 bytes is set, and one byte more is left out", () => {
  const full = range(254).map(() => "x".repeat(255));

  const history = (last: number) => [
    full,
    full,
    full,
    [...range(230).map(() => "x".repeat(255)), "x".repeat(last)],
  ];

  expect(getProfileUpdate({ history: history(52) })).toStrictEqual({
    set: { history: history(52) },
    remove: [],
    isComplete: true,
  });
  expect(getProfileUpdate({ history: history(53) })).toStrictEqual({
    set: {},
    remove: [],
    isComplete: false,
  });
});

test("an update that only removes is complete and sets nothing", () => {
  expect(getProfileUpdate({ role: null, team: null })).toStrictEqual({
    set: {},
    remove: ["role", "team"],
    isComplete: true,
  });
});
