import { expect, test } from "vitest";

import type { AnalyticsSession } from "src/types/AnalyticsSession";
import { getOpenedSession } from "src/utils/internal/destinations/getOpenedSession";

const INVALID_ANSWER: unknown = expect.objectContaining({
  name: "TraceError",
  code: "INVALID_ANSWER",
  message: "The adapter's open returned no session with a track function.",
});

test("a session keeps its native handle, read once, and which identity methods it has", () => {
  const reads: string[] = [];

  const session: AnalyticsSession<string> = {
    get native() {
      reads.push("native");

      return "sdk";
    },
    track: () => ({ status: "submitted", evidence: "sdk-call-returned" }),
    identify: () => {},
    group: () => {},
  };

  expect(getOpenedSession(session)).toEqual({
    session,
    native: "sdk",
    methods: { identify: true, traits: false, group: true, reset: false },
  });
  expect(reads).toEqual(["native"]);
});

test.each([
  ["nothing", undefined],
  ["null", null],
  ["an object without track", {}],
  ["a track that is not a function", { native: null, track: "later" }],
])(
  "an open that answers %s fails the start with INVALID_ANSWER",
  (_, answer) => {
    // @ts-expect-error A JavaScript adapter's open can answer anything.
    expect(() => getOpenedSession(answer)).toThrow(INVALID_ANSWER);
  },
);

test("an open that answers a promise fails the start, and the promise's rejection is observed", async () => {
  const unhandled: unknown[] = [];

  const handleUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };

  process.on("unhandledRejection", handleUnhandled);

  // @ts-expect-error A JavaScript adapter's open can answer a promise.
  expect(() => getOpenedSession(Promise.reject(new Error("late")))).toThrow(
    INVALID_ANSWER,
  );

  await new Promise((resolve) => setTimeout(resolve, 0));
  process.off("unhandledRejection", handleUnhandled);

  expect(unhandled).toEqual([]);
});
