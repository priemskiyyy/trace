import { TraceProvider } from "@priemskiyyy/trace-react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

import { createTrace } from "src/createTrace.fixture";
import { TraceDevtools } from "src/react";
import { spyOnTrace } from "src/spyOnTrace.fixture";

test("on a server the React wrapper renders only its empty host element and observes nothing", () => {
  const { mock, trace } = createTrace();
  const spy = spyOnTrace(trace);

  expect(typeof window).toBe("undefined");
  expect(
    renderToString(
      createElement(
        TraceProvider,
        { trace },
        createElement(TraceDevtools, { initialIsOpen: true }),
      ),
    ),
  ).toBe('<div data-trace-devtools=""></div>');
  expect(spy.live).toEqual({
    diagnostics: 0,
    "diagnostics.events": 0,
    events: 0,
  });
  expect(mock.sessions).toEqual([]);
});
