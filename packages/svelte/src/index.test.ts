import { expect, test } from "vitest";

import * as api from "./index.js";

test("the entry exports exactly its public runtime names", () => {
  expect(Object.keys(api).sort()).toEqual([
    "TraceProvider",
    "useConsent",
    "useDestinationStatus",
    "useTrace",
    "useTraceStatus",
  ]);
});
