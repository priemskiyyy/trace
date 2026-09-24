import { expect, test } from "vitest";

import { isReservedKey } from "src/utils/isReservedKey";

test.each([
  "distinct_id",
  "token",
  "$set",
  "$set_once",
  "$unset",
  "$groups",
  "$process_person_profile",
  "$session_id",
  "$current_url",
  "$",
])("%s is posthog-js's own, so an event cannot carry it", (key) => {
  expect(isReservedKey(key)).toBe(true);
});

test.each([
  "set",
  "tokens",
  "distinct",
  "distinctId",
  "plan",
  "a$b",
  "_$set",
  "Token",
])(
  "%s only resembles a name posthog-js owns, so an event carries it",
  (key) => {
    expect(isReservedKey(key)).toBe(false);
  },
);
