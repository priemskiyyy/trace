import { expect, test } from "vitest";

import { TraceError } from "src/utils/TraceError";

test("an error Trace creates carries its code, and names itself", () => {
  const error = new TraceError({
    code: "NOT_INITIALIZED",
    message: "PostHog is not initialized.",
  });

  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({
    name: "TraceError",
    code: "NOT_INITIALIZED",
    message: "PostHog is not initialized.",
  });
});

test("a cause is kept as it was thrown, and an error without one has no cause of its own", () => {
  const cause = new Error("The SDK swallowed a network error.");

  const withCause = new TraceError({
    code: "DELIVERY_FAILED",
    message: "The provider reported a failure.",
    cause,
  });

  const withoutCause = new TraceError({
    code: "UNSUPPORTED",
    message: "Heap cannot remove a user property.",
  });

  expect(withCause.cause).toBe(cause);
  expect(Object.hasOwn(withoutCause, "cause")).toBe(false);
});
