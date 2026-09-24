import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { fakeRequest } from "src/fakeRequest.fixture";
import { http } from "src/http";

testAnalyticsAdapter({
  name: "http",
  createAdapter: () => http({ request: fakeRequest().request }),
});
