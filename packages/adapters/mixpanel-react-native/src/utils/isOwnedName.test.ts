import { expect, test } from "vitest";

import { isOwnedName } from "src/utils/isOwnedName";

test("the names Mixpanel reserves for itself are owned", () => {
  expect(
    ["time", "distinct_id", "token", "ip", "alias", "bucket"].map(isOwnedName),
  ).toEqual([true, true, true, true, true, true]);
});

test("every name that starts with $ or mp_ is owned", () => {
  expect(
    ["$insert_id", "$user_id", "$device_id", "$email", "mp_lib"].map(
      isOwnedName,
    ),
  ).toEqual([true, true, true, true, true]);
});

test("names that only resemble an owned name are not owned", () => {
  expect(
    ["time_zone", "ip_country", "aliases", "tokens", "mpg", "workspace"].map(
      isOwnedName,
    ),
  ).toEqual([false, false, false, false, false, false]);
});
