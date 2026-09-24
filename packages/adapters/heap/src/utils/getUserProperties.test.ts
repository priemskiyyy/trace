import { expect, test } from "vitest";

import { getUserProperties } from "src/utils/getUserProperties";

test("text, numbers and booleans are kept, and the update is complete", () => {
  expect(
    getUserProperties({
      plan: "pro",
      seats: 4,
      beta: true,
      bio: "b".repeat(255),
    }),
  ).toStrictEqual({
    properties: { plan: "pro", seats: 4, beta: true, bio: "b".repeat(255) },
    isComplete: true,
  });
});

test("text over 255 characters is left out, because Heap would cut it, and the update is incomplete", () => {
  expect(
    getUserProperties({ plan: "pro", bio: "b".repeat(256) }),
  ).toStrictEqual({ properties: { plan: "pro" }, isComplete: false });
});

test.each([[""], [{ city: "Kyiv" }], [["gift"]]])(
  "%j is left out, because heap.js drops a blank or nested value and Heap documents no list for a user",
  (value) => {
    expect(getUserProperties({ plan: "pro", other: value })).toStrictEqual({
      properties: { plan: "pro" },
      isComplete: false,
    });
  },
);

test("a name Heap refuses is left out", () => {
  expect(
    getUserProperties({ plan: "pro", ["k".repeat(512)]: "long" }),
  ).toStrictEqual({ properties: { plan: "pro" }, isComplete: false });
});

test("an empty update is complete and sets nothing", () => {
  expect(getUserProperties({})).toStrictEqual({
    properties: {},
    isComplete: true,
  });
});
