import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { fakePostHog } from "src/fakePostHog.fixture";
import { posthog } from "src/posthog";

testAnalyticsAdapter({
  name: "posthog",
  createAdapter: () => posthog({ sdk: fakePostHog().sdk }),
});

testAnalyticsAdapter({
  name: "posthog with a visitor id",
  createAdapter: () =>
    posthog({ sdk: fakePostHog().sdk, anonymousId: "visitor-7" }),
});
