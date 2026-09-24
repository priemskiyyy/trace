import { expect, test } from "vitest";

import type { FlushResult } from "src/types/FlushResult";
import { copyFlushResult } from "src/utils/internal/destinations/copyFlushResult";
import { TraceError } from "src/utils/TraceError";

const getInvalidAnswer = (result: FlushResult) => {
  if (result.status !== "failed" || !(result.error instanceof TraceError)) {
    return null;
  }

  return { code: result.error.code, message: result.error.message };
};

test("a flushed or timed out answer is published as a frozen copy of itself", () => {
  for (const answer of [{ status: "flushed" }, { status: "timeout" }]) {
    const result = copyFlushResult({ ...answer, extra: "ignored" });

    expect(result).toEqual(answer);
    expect(Object.isFrozen(result)).toBe(true);
  }
});

test("a failed flush keeps the error it failed with", () => {
  const failure = new Error("upload failed");
  const result = copyFlushResult({ status: "failed", error: failure });

  expect(result).toEqual({ status: "failed", error: failure });
  expect(result.status === "failed" ? result.error : null).toBe(failure);
  expect(Object.isFrozen(result)).toBe(true);
});

test("an answer with no status the contract allows becomes failed with TraceError INVALID_ANSWER", () => {
  const answers = [
    undefined,
    null,
    "flushed",
    [{ status: "flushed" }],
    {},
    { status: "done" },
    { status: "not-ready" },
    { status: "unsupported" },
  ];

  for (const answer of answers) {
    const result = copyFlushResult(answer);

    expect(getInvalidAnswer(result)).toEqual({
      code: "INVALID_ANSWER",
      message:
        "The adapter answered flush with a result its contract does not allow.",
    });
    expect(Object.isFrozen(result)).toBe(true);
  }
});

test("an answer whose fields throw when read is a failed result with that error, never a throw", () => {
  const failure = new Error("getter exploded");

  const answer = {
    get status() {
      throw failure;
    },
  };

  expect(copyFlushResult(answer)).toEqual({ status: "failed", error: failure });
});
