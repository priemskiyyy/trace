import { TraceProvider } from "@priemskiyyy/trace-solid";
import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { expect, test } from "vitest";

import { createTrace } from "src/createTrace.fixture";
import { TraceDevtools } from "src/solid";
import { spyOnTrace } from "src/spyOnTrace.fixture";

test("on a server the Solid wrapper renders nothing and observes nothing", () => {
  const { mock, trace } = createTrace();
  const spy = spyOnTrace(trace);

  expect(typeof window).toBe("undefined");
  expect(TraceDevtools({ initialIsOpen: true })).toBeNull();
  expect(
    renderToString(() =>
      createComponent(TraceProvider, {
        trace,
        get children() {
          return createComponent(TraceDevtools, { initialIsOpen: true });
        },
      }),
    ),
  ).toBe("");
  expect(spy.live).toEqual({
    diagnostics: 0,
    "diagnostics.events": 0,
    events: 0,
  });
  expect(mock.sessions).toEqual([]);
});
