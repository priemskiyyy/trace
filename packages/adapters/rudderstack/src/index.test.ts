import { expect, test } from "vitest";

import * as api from "src/index";

test("the entry exports exactly its public runtime names", () => {
  expect(Object.keys(api)).toEqual(["rudderstack"]);
});
