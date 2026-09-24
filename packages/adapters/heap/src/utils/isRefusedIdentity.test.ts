import { expect, test } from "vitest";

import { isRefusedIdentity } from "src/utils/isRefusedIdentity";

test.each([
  "undefined",
  "anonymous",
  "true",
  "false",
  "not_authenticated",
  "NaN",
  "NA",
  "Na",
  "unique_identifier",
  "0",
  '""',
  "[object Object]",
  "{{ customer.email }}",
  "{{ email }}",
  "hashed_user_id",
])("%j is refused, because heap.js ignores it", (identity) => {
  expect(isRefusedIdentity(identity)).toBe(true);
});

test.each(["email", "EMAIL", "None", "UNKNOWN", "Guest", "null", "NULL"])(
  "%j is refused in any letter case, because heap.js ignores it",
  (identity) => {
    expect(isRefusedIdentity(identity)).toBe(true);
  },
);

test.each(["ada", "Anonymous", "anonymous-7", "user_null", "00", "emails"])(
  "%j is accepted, because heap.js refuses only exact matches",
  (identity) => {
    expect(isRefusedIdentity(identity)).toBe(false);
  },
);

test("an identity of 255 characters or more is refused, because heap.js would cut it and could make two users one", () => {
  expect(isRefusedIdentity("a".repeat(255))).toBe(true);
  expect(isRefusedIdentity("a".repeat(254))).toBe(false);
});
