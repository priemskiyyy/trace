import { Identify } from "@amplitude/analytics-browser";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { ampli } from "src/ampli";
import { fakeAmpli } from "src/fakeAmpli.fixture";
import { identityPlugin } from "src/identityPlugin";

testAnalyticsAdapter({
  name: "ampli",
  createAdapter: () => {
    const fake = fakeAmpli();
    const plugin = identityPlugin();

    fake.sdk.client.add(plugin);

    return ampli({ sdk: fake.sdk, Identify, plugin });
  },
});
