import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { fakePostHog } from "src/fakePostHog.fixture";
import { posthog } from "src/posthog";

testAnalyticsAdapter({
  name: "posthog-react-native",
  createAdapter: () => posthog({ sdk: fakePostHog().sdk }),
});
