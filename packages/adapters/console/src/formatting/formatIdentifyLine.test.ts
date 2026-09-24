import { expect, test } from "vitest";

import { formatIdentifyLine } from "src/formatting/formatIdentifyLine";

test("an identify is summarized by the user it names", () => {
  expect(formatIdentifyLine({ user: { id: "user_42" } })).toBe(
    '[trace] identify "user_42"',
  );
});

test("the user id is written as JSON, so the summary stays on one line", () => {
  expect(formatIdentifyLine({ user: { id: 'a "b"\nc' } })).toBe(
    '[trace] identify "a \\"b\\"\\nc"',
  );
});
