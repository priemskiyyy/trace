import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";
import { beforeEach, vi } from "vitest";

import { console } from "src/console";

beforeEach(() => {
  vi.spyOn(globalThis.console, "info").mockImplementation(() => {});
});

testAnalyticsAdapter({
  name: "console with an injected writer",
  createAdapter: () => console({ writer: () => {} }),
});

testAnalyticsAdapter({
  name: "console over the global console",
  createAdapter: () => console(),
});
