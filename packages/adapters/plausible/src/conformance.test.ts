import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { fakePlausible } from "src/fakePlausible.fixture";
import { plausible } from "src/plausible";

testAnalyticsAdapter({
  name: "plausible",
  createAdapter: () => plausible({ sdk: fakePlausible().sdk }),
});
