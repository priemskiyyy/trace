import { TraceError } from "@priemskiyyy/trace";
import type { PostHogConfig } from "posthog-js";
import { expect, test } from "vitest";

import { fakePostHog } from "src/fakePostHog.fixture";
import { assertPersonProfiles } from "src/utils/assertPersonProfiles";

const getThrown = (call: () => unknown) => {
  try {
    call();
  } catch (error) {
    return error;
  }

  return null;
};

test('a posthog-js that keeps no person, under person_profiles "never", is reported unsupported', () => {
  const { sdk } = fakePostHog({ config: { person_profiles: "never" } });

  expect(getThrown(() => assertPersonProfiles(sdk))).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message: `PostHog's person_profiles "never" keeps no person, so it ignores identify, person properties and group properties.`,
    }),
  );
});

const keeping: {
  person_profiles?: NonNullable<PostHogConfig["person_profiles"]>;
}[] = [
  { person_profiles: "identified_only" },
  { person_profiles: "always" },
  {},
];

test.each(keeping)(
  "a posthog-js under person_profiles $person_profiles keeps its persons",
  (config) => {
    const { sdk } = fakePostHog({ config });

    expect(getThrown(() => assertPersonProfiles(sdk))).toBe(null);
  },
);
