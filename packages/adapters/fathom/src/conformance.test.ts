import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { fakeFathom } from "src/fakeFathom.fixture";
import { fathom } from "src/fathom";

testAnalyticsAdapter({
  name: "fathom",
  createAdapter: () => fathom({ sdk: fakeFathom().sdk }),
});

testAnalyticsAdapter({
  name: "fathom with a value",
  createAdapter: () => fathom({ sdk: fakeFathom().sdk, value: () => 4950 }),
});
