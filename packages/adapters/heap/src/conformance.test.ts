import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { fakeHeap } from "src/fakeHeap.fixture";
import { heap } from "src/heap";

testAnalyticsAdapter({
  name: "heap",
  createAdapter: () => heap({ sdk: fakeHeap().sdk }),
});
