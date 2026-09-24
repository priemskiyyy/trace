import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { fakeRudderStack } from "src/fakeRudderStack.fixture";
import { rudderstack } from "src/rudderstack";

testAnalyticsAdapter({
  name: "rudderstack",
  createAdapter: () => rudderstack({ sdk: fakeRudderStack().sdk }),
});

testAnalyticsAdapter({
  name: "rudderstack with a group type",
  createAdapter: () =>
    rudderstack({ sdk: fakeRudderStack().sdk, group: { type: "workspace" } }),
});
