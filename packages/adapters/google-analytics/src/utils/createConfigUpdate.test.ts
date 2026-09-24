import { expect, test } from "vitest";

import { fakeGtag } from "src/fakeGtag.fixture";
import { createConfigUpdate } from "src/utils/createConfigUpdate";

test("creating the update sends nothing", () => {
  const fake = fakeGtag();

  createConfigUpdate(fake.sdk, "G-TRACE12345");

  expect(fake.dataLayer).toEqual([]);
});

test("the first update carries send_page_view: false, so it never adds a page_view, and every later one leaves it out", () => {
  const fake = fakeGtag();
  const update = createConfigUpdate(fake.sdk, "G-TRACE12345");

  update({ user_id: "ada" });
  update({ user_properties: { plan: "pro" } });
  update({ user_id: null });

  expect(fake.dataLayer).toEqual([
    [
      "config",
      "G-TRACE12345",
      { update: true, send_page_view: false, user_id: "ada" },
    ],
    [
      "config",
      "G-TRACE12345",
      { update: true, user_properties: { plan: "pro" } },
    ],
    ["config", "G-TRACE12345", { update: true, user_id: null }],
  ]);
});

test("an update gtag refused leaves the next one first", () => {
  const fake = fakeGtag();
  const error = new Error("dataLayer.push is not a function");

  let refused = false;

  const update = createConfigUpdate((...command: unknown[]) => {
    if (!refused) {
      refused = true;

      throw error;
    }

    fake.sdk(...command);
  }, "G-TRACE12345");

  expect(() => update({ user_id: "ada" })).toThrow(error);

  update({ user_id: "ada" });

  expect(fake.dataLayer).toEqual([
    [
      "config",
      "G-TRACE12345",
      { update: true, send_page_view: false, user_id: "ada" },
    ],
  ]);
});
