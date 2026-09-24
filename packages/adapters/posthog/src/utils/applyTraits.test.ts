import { TraceError } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { fakePostHog } from "src/fakePostHog.fixture";
import { applyTraits } from "src/utils/applyTraits";

const getThrown = (call: () => unknown) => {
  try {
    call();
  } catch (error) {
    return error;
  }

  return null;
};

test("traits unset the removed names, then set the values as person properties", () => {
  const fake = fakePostHog();

  applyTraits(fake.sdk, {
    user: { id: "ada" },
    set: { plan: "pro", profile: { score: null } },
    remove: ["legacy"],
  });

  expect(fake.calls.unsetPersonProperties).toStrictEqual([["legacy"]]);
  expect(fake.calls.setPersonProperties).toStrictEqual([
    { plan: "pro", profile: { score: null } },
  ]);
  expect(
    fake.captured.map(({ properties }) => properties.$unset ?? properties.$set),
  ).toStrictEqual([["legacy"], { plan: "pro", profile: { score: null } }]);
});

test("traits that only remove, or only set, make only that call", () => {
  const removing = fakePostHog();
  const setting = fakePostHog();

  applyTraits(removing.sdk, { user: null, set: {}, remove: ["legacy"] });
  applyTraits(setting.sdk, { user: null, set: { plan: "pro" }, remove: [] });

  expect(removing.calls.unsetPersonProperties).toStrictEqual([["legacy"]]);
  expect(removing.calls.setPersonProperties).toStrictEqual([]);
  expect(setting.calls.unsetPersonProperties).toStrictEqual([]);
  expect(setting.calls.setPersonProperties).toStrictEqual([{ plan: "pro" }]);
});

test('under person_profiles "never", traits are reported unsupported and nothing is sent', () => {
  const fake = fakePostHog({ config: { person_profiles: "never" } });

  expect(
    getThrown(() =>
      applyTraits(fake.sdk, {
        user: { id: "ada" },
        set: { plan: "pro" },
        remove: ["legacy"],
      }),
    ),
  ).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message: `PostHog's person_profiles "never" keeps no person, so it ignores identify, person properties and group properties.`,
    }),
  );
  expect(fake.calls.setPersonProperties).toStrictEqual([]);
  expect(fake.calls.unsetPersonProperties).toStrictEqual([]);
});

test("a trait holding a string posthog-js would cut is left out whole, the rest is set, and then the update is reported unsupported", () => {
  const fake = fakePostHog({ config: { properties_string_max_length: 8 } });

  const thrown = getThrown(() =>
    applyTraits(fake.sdk, {
      user: { id: "ada" },
      set: {
        plan: "pro",
        note: "abcdefghi",
        profile: { bio: "abcdefghi", seats: 3 },
      },
      remove: ["legacy"],
    }),
  );

  expect(fake.calls.unsetPersonProperties).toStrictEqual([["legacy"]]);
  expect(fake.calls.setPersonProperties).toStrictEqual([{ plan: "pro" }]);
  expect(thrown).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "posthog-js would cut these values past properties_string_max_length, so they were left out: traits.note, traits.profile.",
    }),
  );
});

test("traits whose every value posthog-js would cut set nothing, and are reported unsupported", () => {
  const fake = fakePostHog({ config: { properties_string_max_length: 8 } });

  const thrown = getThrown(() =>
    applyTraits(fake.sdk, {
      user: { id: "ada" },
      set: { note: "abcdefghi" },
      remove: [],
    }),
  );

  expect(fake.calls.setPersonProperties).toStrictEqual([]);
  expect(thrown).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "posthog-js would cut these values past properties_string_max_length, so they were left out: traits.note.",
    }),
  );
});
