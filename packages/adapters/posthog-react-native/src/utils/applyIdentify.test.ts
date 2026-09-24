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

const REFUSED = new TraceError({
  code: "UNSUPPORTED",
  message:
    "PostHog refuses to identify a person by a placeholder id like this one, so the person stays anonymous there.",
});

test("a user is PostHog's identify", () => {
  const fake = fakePostHog();

  applyIdentify(fake.sdk, { id: "ada" });

  expect(fake.calls).toStrictEqual([{ method: "identify", args: ["ada"] }]);
  expect(fake.state.distinctId).toBe("ada");
});

test.each([
  "anonymous",
  "guest",
  "distinctid",
  "distinct_id",
  "id",
  "not_authenticated",
  "email",
  "undefined",
  "true",
  "false",
  "Guest",
  "ANONYMOUS",
  "Distinct_ID",
])(
  "%s, an id PostHog refuses in any case, is reported unsupported and never sent",
  (id) => {
    const fake = fakePostHog();

    expect(getThrown(() => applyIdentify(fake.sdk, { id }))).toStrictEqual(
      REFUSED,
    );
    expect(fake.calls).toStrictEqual([]);
  },
);

test.each(["[object Object]", "NaN", "None", "none", "null", "0"])(
  "%s, an id PostHog refuses in this spelling, is reported unsupported and never sent",
  (id) => {
    const fake = fakePostHog();

    expect(getThrown(() => applyIdentify(fake.sdk, { id }))).toStrictEqual(
      REFUSED,
    );
    expect(fake.calls).toStrictEqual([]);
  },
);

test.each([" ", "   ", "\t", " \n "])(
  "an id of only white space, %j, is reported unsupported and never sent",
  (id) => {
    const fake = fakePostHog();

    expect(getThrown(() => applyIdentify(fake.sdk, { id }))).toStrictEqual(
      REFUSED,
    );
    expect(fake.calls).toStrictEqual([]);
  },
);

test.each(["NULL", "Null", "nan", "NONE", "00", "guest_42", "anonymous-7"])(
  "%s only resembles a refused id, so it is identified",
  (id) => {
    const fake = fakePostHog();

    applyIdentify(fake.sdk, { id });

    expect(fake.calls).toStrictEqual([{ method: "identify", args: [id] }]);
  },
);

test("an id of 200 characters is identified, and one of 201, which PostHog would shorten, fails with DELIVERY_FAILED and is never sent", () => {
  const kept = fakePostHog();
  const refused = fakePostHog();

  applyIdentify(kept.sdk, { id: "u".repeat(200) });

  expect(kept.calls).toStrictEqual([
    { method: "identify", args: ["u".repeat(200)] },
  ]);
  expect(
    getThrown(() => applyIdentify(refused.sdk, { id: "u".repeat(201) })),
  ).toStrictEqual(
    new TraceError({
      code: "DELIVERY_FAILED",
      message:
        "PostHog keeps the first 200 characters of a distinct id, so this user would share a person with any id that starts the same.",
    }),
  );
  expect(refused.calls).toStrictEqual([]);
});

test("the length counts UTF-16 code units, so 100 emoji fit and 101 do not", () => {
  const kept = fakePostHog();
  const refused = fakePostHog();

  applyIdentify(kept.sdk, { id: "😀".repeat(100) });

  expect(kept.calls).toStrictEqual([
    { method: "identify", args: ["😀".repeat(100)] },
  ]);
  expect(
    getThrown(() => applyIdentify(refused.sdk, { id: "😀".repeat(101) })),
  ).toStrictEqual(
    new TraceError({
      code: "DELIVERY_FAILED",
      message:
        "PostHog keeps the first 200 characters of a distinct id, so this user would share a person with any id that starts the same.",
    }),
  );
  expect(refused.calls).toStrictEqual([]);
});
