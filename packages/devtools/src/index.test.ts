import { expect, test } from "vitest";

import * as api from "src/index";
import * as react from "src/react";
import * as solid from "src/solid";
import * as svelte from "src/svelte";
import * as vue from "src/vue";

test("every entry exports exactly its public runtime names", () => {
  expect(Object.keys(api)).toEqual(["TraceDevtools"]);
  expect(Object.keys(react)).toEqual(["TraceDevtools"]);
  expect(Object.keys(solid)).toEqual(["TraceDevtools"]);
  expect(Object.keys(svelte)).toEqual(["createDevtools"]);
  expect(Object.keys(vue)).toEqual(["TraceDevtools"]);
});
