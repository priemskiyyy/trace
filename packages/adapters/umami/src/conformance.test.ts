import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { fakeUmami } from "src/fakeUmami.fixture";
import { umami } from "src/umami";

testAnalyticsAdapter({
  name: "umami",
  createAdapter: () => umami({ sdk: fakeUmami().sdk }),
});
