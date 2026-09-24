import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { fakeVercel } from "src/fakeVercel.fixture";
import { vercel } from "src/vercel";

testAnalyticsAdapter({
  name: "vercel",
  createAdapter: () => vercel({ sdk: fakeVercel().sdk }),
});

testAnalyticsAdapter({
  name: "vercel with eight properties",
  createAdapter: () =>
    vercel({ sdk: fakeVercel().sdk, limits: { properties: 8 } }),
});
