import { expect, test } from "vitest";

import { devtoolsReducer } from "src/utils/devtoolsReducer";

test("opening and closing move focus and remember the newest event shown before closing", () => {
  const opened = devtoolsReducer(
    {
      panel: { state: "CLOSED", autoFocus: false, closedAfter: 0 },
      isPaused: false,
    },
    { kind: "OPEN" },
  );

  expect(opened.panel).toEqual({ state: "OPEN", autoFocus: true });

  const closed = devtoolsReducer(opened, { kind: "CLOSE", after: 42 });

  expect(closed.panel).toEqual({
    state: "CLOSED",
    autoFocus: true,
    closedAfter: 42,
  });
});

test("pausing toggles and leaves the panel alone", () => {
  const paused = devtoolsReducer(
    { panel: { state: "OPEN", autoFocus: false }, isPaused: false },
    { kind: "TOGGLE_PAUSE" },
  );

  expect(paused).toEqual({
    panel: { state: "OPEN", autoFocus: false },
    isPaused: true,
  });
  expect(devtoolsReducer(paused, { kind: "TOGGLE_PAUSE" })).toEqual({
    panel: { state: "OPEN", autoFocus: false },
    isPaused: false,
  });
});
