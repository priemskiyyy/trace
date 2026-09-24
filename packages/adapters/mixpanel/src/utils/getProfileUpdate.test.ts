import { expect, test } from "vitest";

import {
  RESERVED_GROUP_PROPERTIES,
  RESERVED_PROFILE_PROPERTIES,
} from "src/utils/constants/properties";
import { getProfileUpdate } from "src/utils/getProfileUpdate";

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const isProfileReserved = (name: string) =>
  RESERVED_PROFILE_PROPERTIES.includes(name);

const isGroupReserved = (name: string) =>
  RESERVED_GROUP_PROPERTIES.includes(name);

test("an update within Mixpanel's limits is sent exactly as given, a $ name, text and a name of 255 characters included", () => {
  const set = {
    plan: "pro",
    seats: 3,
    tags: ["beta"],
    address: { city: "Berlin", geo: { lat: 52.5 } },
    $email: "ada@example.com",
    bio: "x".repeat(255),
    ["k".repeat(255)]: "kept",
  };

  expect(
    getProfileUpdate({ set, remove: ["role"] }, isProfileReserved),
  ).toEqual({ set, remove: ["role"], isComplete: true });
});

test("a trait holding text or a name Mixpanel would cut, at any depth, is left out whole, and the update is incomplete", () => {
  expect(
    getProfileUpdate(
      {
        set: {
          plan: "pro",
          bio: "x".repeat(256),
          address: { street: "s".repeat(256) },
          tags: ["beta", "t".repeat(256)],
          labels: { ["n".repeat(256)]: 1 },
          ["k".repeat(256)]: 1,
        },
        remove: [],
      },
      isProfileReserved,
    ),
  ).toEqual({ set: { plan: "pro" }, remove: [], isComplete: false });
});

test("a trait with a part past a nesting or count limit is left out whole, and the update is incomplete", () => {
  expect(
    getProfileUpdate(
      {
        set: {
          plan: "pro",
          deep: { a: { b: { c: 1, d: { e: 1 } } } },
          ids: range(255),
          counts: Object.fromEntries(
            range(255).map((index) => [`k${index}`, index]),
          ),
          rows: [{ sku: "sku_1", attributes: { color: "red" } }],
        },
        remove: [],
      },
      isProfileReserved,
    ),
  ).toEqual({ set: { plan: "pro" }, remove: [], isComplete: false });
});

test("a list or object property over 256,000 bytes of JSON is left out, and the update is incomplete", () => {
  const row = range(254).map(() => "x".repeat(255));

  expect(
    getProfileUpdate(
      {
        set: {
          fits: range(3).map(() => row),
          overflows: range(4).map(() => row),
        },
        remove: [],
      },
      isProfileReserved,
    ),
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

  expect(
    getProfileUpdate(
      { set: { atLimit: rows(52) }, remove: [] },
      isProfileReserved,
    ),
  ).toEqual({ set: { atLimit: rows(52) }, remove: [], isComplete: true });
  expect(
    getProfileUpdate(
      { set: { overLimit: rows(53) }, remove: [] },
      isProfileReserved,
    ),
  ).toEqual({ set: {}, remove: [], isComplete: false });
});

test("the profile names mixpanel-browser drops without a word are left out of the values and the removals, and the update is incomplete", () => {
  expect(
    getProfileUpdate(
      {
        set: {
          plan: "pro",
          $distinct_id: "grace",
          $token: "other-project",
          $device_id: "device-9",
          $user_id: "grace",
          $had_persisted_distinct_id: true,
        },
        remove: ["role", "$user_id"],
      },
      isProfileReserved,
    ),
  ).toEqual({ set: { plan: "pro" }, remove: ["role"], isComplete: false });
});

test("the group names mixpanel-browser drops without a word are left out of the values and the removals, and the update is incomplete", () => {
  expect(
    getProfileUpdate(
      {
        set: { plan: "team", $group_key: "company" },
        remove: ["legacy", "$group_id"],
      },
      isGroupReserved,
    ),
  ).toEqual({ set: { plan: "team" }, remove: ["legacy"], isComplete: false });
});

test("a reserved name among the removals alone makes the update incomplete", () => {
  expect(
    getProfileUpdate(
      { set: { plan: "pro" }, remove: ["$token"] },
      isProfileReserved,
    ),
  ).toEqual({ set: { plan: "pro" }, remove: [], isComplete: false });
});

test("a reserved name among the values alone makes the update incomplete", () => {
  expect(
    getProfileUpdate(
      { set: { plan: "pro", $distinct_id: "grace" }, remove: [] },
      isProfileReserved,
    ),
  ).toEqual({ set: { plan: "pro" }, remove: [], isComplete: false });
});

test("a removal whose name mixpanel-browser would cut past 255 characters is left out, since it would remove another property, and the update is incomplete", () => {
  expect(
    getProfileUpdate(
      {
        set: { plan: "pro" },
        remove: ["role", "k".repeat(256), "n".repeat(255)],
      },
      isGroupReserved,
    ),
  ).toEqual({
    set: { plan: "pro" },
    remove: ["role", "n".repeat(255)],
    isComplete: false,
  });
});
