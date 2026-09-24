import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { fakePostHog } from "src/fakePostHog.fixture";
import { posthog } from "src/posthog";

testAnalyticsAdapter({
  name: "posthog",
  createAdapter: () => posthog({ sdk: fakePostHog().sdk }),
});

testAnalyticsAdapter({
  name: 'posthog with person_profiles "never"',
  createAdapter: () =>
    posthog({
      sdk: fakePostHog({ config: { person_profiles: "never" } }).sdk,
    }),
});
