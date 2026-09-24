import { createMockAdapter } from "src/mock/createMockAdapter";
import { testAnalyticsAdapter } from "src/testing/testAnalyticsAdapter";

testAnalyticsAdapter({
  name: "full mock",
  createAdapter: () => createMockAdapter().adapter,
});

testAnalyticsAdapter({
  name: "minimal mock",
  createAdapter: () =>
    createMockAdapter({ identity: false, collection: false, flush: false })
      .adapter,
});
