import { Identify } from "@amplitude/analytics-browser";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { amplitude } from "src/amplitude";
import { fakeAmplitude } from "src/fakeAmplitude.fixture";
import { identityPlugin } from "src/identityPlugin";

testAnalyticsAdapter({
  name: "amplitude",
  createAdapter: () => {
    const { sdk } = fakeAmplitude();
    const plugin = identityPlugin();

    sdk.add(plugin);

    return amplitude({ sdk, Identify, plugin });
  },
});
