import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

import { fakeSegment } from "src/fakeSegment.fixture";
import { segment } from "src/segment";

testAnalyticsAdapter({
  name: "segment",
  createAdapter: () => segment({ sdk: fakeSegment().sdk }),
});

testAnalyticsAdapter({
  name: "segment with a group type",
  createAdapter: () =>
    segment({ sdk: fakeSegment().sdk, group: { type: "workspace" } }),
});
