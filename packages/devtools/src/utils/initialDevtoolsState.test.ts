import { expect, test } from "vitest";

import { initialDevtoolsState } from "src/utils/initialDevtoolsState";

test("the initial state opens only when asked and never moves focus on mount", () => {
  expect(initialDevtoolsState(false)).toEqual({
    panel: { state: "CLOSED", autoFocus: false, closedAfter: 0 },
    isPaused: false,
  });
  expect(initialDevtoolsState(true)).toEqual({
    panel: { state: "OPEN", autoFocus: false },
    isPaused: false,
  });
});
