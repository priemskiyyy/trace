import { TraceError } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { fakePostHog } from "src/fakePostHog.fixture";
import { applyIdentify } from "src/utils/applyIdentify";

const getThrown = (call: () => unknown) => {
  try {
    call();
  } catch (error) {
    return error;
  }

  return null;
};

test("a user is PostHog's identify", () => {
  const fake = fakePostHog();

  applyIdentify(fake.sdk, { id: "ada" });

  expect(fake.calls.identify).toStrictEqual(["ada"]);
  expect(fake.state.distinctId).toBe("ada");
});

test.each([
  "distinct_id",
  "distinctid",
  "undefined",
  "null",
  "NULL",
  "Undefined",
  "$posthog_cookieless",
])(
  "an id posthog-js refuses to identify, %s, is reported unsupported and never sent",
  (id) => {
    const fake = fakePostHog();

    expect(getThrown(() => applyIdentify(fake.sdk, { id }))).toStrictEqual(
      new TraceError({
        code: "UNSUPPORTED",
        message: `posthog-js refuses to identify "${id}", so the person stays anonymous there.`,
      }),
    );
    expect(fake.calls.identify).toStrictEqual([]);
  },
);

test("the cookieless placeholder is refused only as posthog-js spells it, so another spelling is identified", () => {
  const fake = fakePostHog();

  applyIdentify(fake.sdk, { id: "$PostHog_Cookieless" });

  expect(fake.calls.identify).toStrictEqual(["$PostHog_Cookieless"]);
  expect(fake.state.distinctId).toBe("$PostHog_Cookieless");
});

test('under person_profiles "never", a user is reported unsupported and never sent', () => {
  const fake = fakePostHog({ config: { person_profiles: "never" } });

  expect(getThrown(() => applyIdentify(fake.sdk, { id: "ada" }))).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message: `PostHog's person_profiles "never" keeps no person, so it ignores identify, person properties and group properties.`,
    }),
  );
  expect(fake.calls.identify).toStrictEqual([]);
});

test("an id of 200 characters is identified, and one of 201, which PostHog would shorten, fails with DELIVERY_FAILED and is never sent", () => {
  const kept = fakePostHog();
  const refused = fakePostHog();

  applyIdentify(kept.sdk, { id: "u".repeat(200) });

  expect(kept.calls.identify).toStrictEqual(["u".repeat(200)]);
  expect(
    getThrown(() => applyIdentify(refused.sdk, { id: "u".repeat(201) })),
  ).toStrictEqual(
    new TraceError({
      code: "DELIVERY_FAILED",
      message:
        "PostHog keeps the first 200 characters of a distinct id, so this user would share a person with any id that starts the same.",
    }),
  );
  expect(refused.calls.identify).toStrictEqual([]);
});

test("where posthog-js cuts strings shorter than 200 characters, an id past its length fails too", () => {
  const kept = fakePostHog({ config: { properties_string_max_length: 40 } });
  const refused = fakePostHog({ config: { properties_string_max_length: 40 } });

  applyIdentify(kept.sdk, { id: "u".repeat(40) });

  expect(kept.calls.identify).toStrictEqual(["u".repeat(40)]);
  expect(
    getThrown(() => applyIdentify(refused.sdk, { id: "u".repeat(41) })),
  ).toStrictEqual(
    new TraceError({
      code: "DELIVERY_FAILED",
      message:
        "PostHog keeps the first 40 characters of a distinct id, so this user would share a person with any id that starts the same.",
    }),
  );
  expect(refused.calls.identify).toStrictEqual([]);
});
