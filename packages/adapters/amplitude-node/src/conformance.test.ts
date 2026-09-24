import { Identify } from "@amplitude/analytics-node";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { amplitude } from "src/amplitude";
import { fakeAmplitude } from "src/fakeAmplitude.fixture";

testAnalyticsAdapter({
  name: "amplitude",
  createAdapter: () => amplitude({ sdk: fakeAmplitude().sdk, Identify }),
});

testAnalyticsAdapter({
  name: "amplitude with a visitor id",
  createAdapter: () =>
    amplitude({
      sdk: fakeAmplitude().sdk,
      Identify,
      anonymousId: "visitor-7",
    }),
});
