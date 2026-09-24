import { expect, test } from "vitest";

import { getProfileUpdate } from "src/utils/getProfileUpdate";

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

test("an update within Mixpanel's limits is sent exactly as given, a $ name and text and a name of 255 characters included", () => {
  const set = {
    plan: "pro",
    seats: 3,
    tags: ["beta"],
    address: { city: "Berlin", geo: { lat: 52.5 } },
    $email: "ada@example.com",
    bio: "x".repeat(255),
    ["k".repeat(255)]: "kept",
  };

  expect(getProfileUpdate({ set, remove: ["role"] })).toEqual({
    set,
    remove: ["role"],
    isComplete: true,
  });
});

test("a trait holding text or a name Mixpanel would cut, at any depth, is left out whole, and the update is incomplete", () => {
  expect(
    getProfileUpdate({
      set: {
        plan: "pro",
        bio: "x".repeat(256),
        address: { street: "s".repeat(256) },
        tags: ["beta", "t".repeat(256)],
        labels: { ["n".repeat(256)]: 1 },
        ["k".repeat(256)]: 1,
      },
      remove: [],
    }),
  ).toEqual({ set: { plan: "pro" }, remove: [], isComplete: false });
});

test("a trait with a part past a nesting or count limit is left out whole, and the update is incomplete", () => {
  expect(
    getProfileUpdate({
      set: {
        plan: "pro",
        deep: { a: { b: { c: 1, d: { e: 1 } } } },
        ids: range(256),
        rows: [{ sku: "sku_1", attributes: { color: "red" } }],
      },
      remove: [],
    }),
  ).toEqual({ set: { plan: "pro" }, remove: [], isComplete: false });
});

test("a list or object property over 256,000 bytes of JSON as sent is left out, and the update is incomplete", () => {
  const row = range(254).map(() => "x".repeat(255));

  expect(
    getProfileUpdate({
      set: {
        fits: range(3).map(() => row),
        overflows: range(4).map(() => row),
      },
      remove: [],
    }),
  ).toEqual({
    set: { fits: range(3).map(() => row) },
    remove: [],
    isComplete: false,
  });
});

test("a profile property of exactly 256,000 bytes as sent is kept, and one byte more is left out", () => {
  const row = range(254).map(() => "x".repeat(255));

  const rows = (last: number) => [
    row,
    row,
    row,
    [
      ...range(229).map(() => "x".repeat(255)),
      "x".repeat(255),
      "x".repeat(last),
    ],
  ];

  expect(getProfileUpdate({ set: { atLimit: rows(52) }, remove: [] })).toEqual({
    set: { atLimit: rows(52) },
    remove: [],
    isComplete: true,
  });
  expect(
    getProfileUpdate({ set: { overLimit: rows(53) }, remove: [] }),
  ).toEqual({ set: {}, remove: [], isComplete: false });
});

test("an empty update is complete and answers nothing to set or remove", () => {
  expect(getProfileUpdate({ set: {}, remove: [] })).toEqual({
    set: {},
    remove: [],
    isComplete: true,
  });
});

test("a blank or empty name set is left out, since a trait set under it could never be unset, and the update is incomplete", () => {
  expect(
    getProfileUpdate({
      set: { plan: "pro", "": "x", " ": 1, "\t\n": true },
      remove: ["role"],
    }),
  ).toEqual({ set: { plan: "pro" }, remove: ["role"], isComplete: false });
});

test("a blank or empty name removed is left out, since mixpanel-react-native's unset throws on it, and the update is incomplete", () => {
  expect(
    getProfileUpdate({ set: { plan: "pro" }, remove: ["role", "", "  "] }),
  ).toEqual({ set: { plan: "pro" }, remove: ["role"], isComplete: false });
});

test("a name with whitespace around or among other characters is kept, set or removed, since only a blank one is refused", () => {
  expect(
    getProfileUpdate({
      set: { "first name": "Ada", " padded ": 1 },
      remove: [" role ", "last\tname"],
    }),
  ).toEqual({
    set: { "first name": "Ada", " padded ": 1 },
    remove: [" role ", "last\tname"],
    isComplete: true,
  });
});
