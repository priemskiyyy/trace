import { expect, test } from "vitest";

import { getRefusal } from "src/utils/internal/schema/getRefusal";

test("a refusal fails with its one message, at the properties as a whole", () => {
  expect(getRefusal("Expected an object of event properties.")).toStrictEqual({
    ok: false,
    issues: [{ path: "", message: "Expected an object of event properties." }],
  });
});
