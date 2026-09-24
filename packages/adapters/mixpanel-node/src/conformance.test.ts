import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { fakeMixpanel } from "src/fakeMixpanel.fixture";
import { mixpanel } from "src/mixpanel";

testAnalyticsAdapter({
  name: "mixpanel",
  createAdapter: () => mixpanel({ sdk: fakeMixpanel().sdk }),
});

testAnalyticsAdapter({
  name: "mixpanel with an anonymous id",
  createAdapter: () =>
    mixpanel({ sdk: fakeMixpanel().sdk, anonymousId: "visitor-7" }),
});
