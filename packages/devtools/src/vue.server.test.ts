import { TraceProvider } from "@priemskiyyy/trace-vue";
import { expect, test } from "vitest";
import { defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";

import { createTrace } from "src/createTrace.fixture";
import { spyOnTrace } from "src/spyOnTrace.fixture";
import { TraceDevtools } from "src/vue";

test("on a server the Vue wrapper renders only its empty host element and observes nothing", async () => {
  const { mock, trace } = createTrace();
  const spy = spyOnTrace(trace);

  const Application = defineComponent(
    () => () =>
      h(
        TraceProvider,
        { trace },
        { default: () => h(TraceDevtools, { initialIsOpen: true }) },
      ),
  );

  expect(typeof window).toBe("undefined");
  expect(await renderToString(h(Application))).toBe(
    "<!--[--><div data-trace-devtools></div><!--]-->",
  );
  expect(spy.live).toEqual({
    diagnostics: 0,
    "diagnostics.events": 0,
    events: 0,
  });
  expect(mock.sessions).toEqual([]);
});
