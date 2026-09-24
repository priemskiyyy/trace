import { createRoot } from "solid-js";
import { expect, test } from "vitest";

import { useTimeline } from "src/components/Timeline/useTimeline";

test("a timeline part used outside its timeline fails loudly", () => {
  expect(() =>
    createRoot((dispose) => {
      dispose();

      return useTimeline();
    }),
  ).toThrow(new Error("Timeline parts must be rendered inside <Timeline>."));
});
