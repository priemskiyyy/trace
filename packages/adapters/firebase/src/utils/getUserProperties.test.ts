import { expect, test } from "vitest";

import { getUserProperties } from "src/utils/getUserProperties";

test("a set keeps its values as they are and a removal becomes null", () => {
  expect(
    getUserProperties({
      user: { id: "ada" },
      set: {
        plan: "pro",
        seats: 4,
        trial: false,
        bio: "b".repeat(36),
        ["x".repeat(24)]: "kept",
        подія: "так",
      },
      remove: ["role"],
    }),
  ).toEqual({
    properties: {
      role: null,
      plan: "pro",
      seats: 4,
      trial: false,
      bio: "b".repeat(36),
      ["x".repeat(24)]: "kept",
      подія: "так",
    },
    complete: true,
  });
});

test.each([
  "bad name",
  "x".repeat(25),
  "1st_plan",
  "_private",
  "firebase_plan",
  "google_plan",
  "ga_plan",
  "cid",
  "customer_id",
  "customerid",
  "first_open_after_install",
  "first_open_time",
  "first_visit_time",
  "google_allow_ad_personalization_signals",
  "last_advertising_id_reset",
  "last_deep_link_referrer",
  "last_gclid",
  "lifetime_user_engagement",
  "non_personalized_ads",
  "session_id",
  "session_number",
  "sessionid",
  "sfmc_id",
  "sid",
  "uid",
  "user_id",
  "userid",
])(
  "a user property named %j is left out of a set, which leaves the update incomplete, and out of a removal, which it cannot need",
  (name) => {
    expect(
      getUserProperties({
        user: null,
        set: { [name]: "x", plan: "pro" },
        remove: [name],
      }),
    ).toEqual({ properties: { plan: "pro" }, complete: false });
  },
);

test("a nested value or text over 36 characters is left out, never cut, and leaves the update incomplete", () => {
  expect(
    getUserProperties({
      user: { id: "ada" },
      set: {
        plan: "pro",
        bio: "b".repeat(37),
        emoji: "🙂".repeat(37),
        nested: { a: 1 },
        list: ["a"],
      },
      remove: [],
    }),
  ).toEqual({ properties: { plan: "pro" }, complete: false });
});

test("text of 36 characters is measured in characters, not code units", () => {
  expect(
    getUserProperties({
      user: null,
      set: { mood: "🙂".repeat(36) },
      remove: [],
    }),
  ).toEqual({ properties: { mood: "🙂".repeat(36) }, complete: true });
});

test("one update sets every property it carries, because GA4's limit of 25 is per property, not per call", () => {
  const set = Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [`p${index}`, index]),
  );

  expect(getUserProperties({ user: null, set, remove: [] })).toEqual({
    properties: set,
    complete: true,
  });
});

test("an update with nothing GA4 can keep answers no properties", () => {
  expect(
    getUserProperties({ user: null, set: { nested: { a: 1 } }, remove: [] }),
  ).toEqual({ properties: {}, complete: false });
});
