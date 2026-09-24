import type { TrackedEvent } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { formatTrackLine } from "src/formatting/formatTrackLine";

const event = (
  name: string,
  properties: Record<string, unknown>,
): TrackedEvent => ({
  id: "0b0e7a52-9c1d-4f6e-8a3b-1c2d3e4f5a6b",
  name,
  properties,
  context: { app: { version: "2.4.0" } },
  identity: { generation: 1, user: null, traits: {}, groups: {} },
  timestamp: 1_767_225_600_000,
});

test("an event is summarized by its name and its property keys", () => {
  expect(
    formatTrackLine(event("Checkout Started", { cartId: "c_1", value: 49.5 })),
  ).toBe('[trace] track "Checkout Started" ["cartId","value"]');
});

test("an event without properties is summarized by its name alone", () => {
  expect(formatTrackLine(event("App Opened", {}))).toBe(
    '[trace] track "App Opened"',
  );
});

test("the name and the keys are written as JSON, so the summary stays on one line", () => {
  expect(
    formatTrackLine(event('Say "hi"\nthen leave', { "line\nbreak": 1 })),
  ).toBe('[trace] track "Say \\"hi\\"\\nthen leave" ["line\\nbreak"]');
});
