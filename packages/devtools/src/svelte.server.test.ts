import { render } from "svelte/server";
import { expect, test } from "vitest";

import { createTrace } from "src/createTrace.fixture";
import { spyOnTrace } from "src/spyOnTrace.fixture";
import Fixture from "src/svelte.fixture.svelte";

test("on a server the Svelte attachment never runs, so its host element stays empty and nothing is observed", () => {
  const { mock, trace } = createTrace();
  const spy = spyOnTrace(trace);

  expect(typeof window).toBe("undefined");
  expect(
    render(Fixture, { props: { trace, options: { initialIsOpen: true } } })
      .body,
  ).toBe("<!--[--><!--[0--><div></div><!----><!--]--><!--]-->");
  expect(spy.live).toEqual({
    diagnostics: 0,
    "diagnostics.events": 0,
    events: 0,
  });
  expect(mock.sessions).toEqual([]);
});
