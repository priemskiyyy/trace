import { expect, test } from "vitest";

import * as api from "src/index";

test("the package exposes its ampli factory, fromAmpli and identityPlugin and nothing else", () => {
  expect(Object.keys(api)).toEqual(["ampli", "fromAmpli", "identityPlugin"]);
});
