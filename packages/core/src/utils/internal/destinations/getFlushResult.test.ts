import { expect, test } from "vitest";

import type { DestinationFlushResult } from "src/types/DestinationFlushResult";
import { getFlushResult } from "src/utils/internal/destinations/getFlushResult";
import { TraceError } from "src/utils/TraceError";

const failure = new Error("upload failed");

const getInvalidAnswer = (result: DestinationFlushResult) => {
  if (result.status !== "failed" || !(result.error instanceof TraceError)) {
    return null;
  }

  return { code: result.error.code, message: result.error.message };
};

test("a flush that threw or rejected failed with its error, and a frozen result says so", async () => {
  const threw = getFlushResult({ kind: "THREW", error: failure });

  const rejected = await getFlushResult({
    kind: "PENDING",
    promise: Promise.reject(failure),
  });

  expect([threw, rejected]).toEqual([
    { status: "failed", error: failure },
    { status: "failed", error: failure },
  ]);
  expect([threw, rejected].map(Object.isFrozen)).toEqual([true, true]);
});

test("an answer, now or later, is copied as the contract allows", async () => {
  await expect(
    getFlushResult({
      kind: "PENDING",
      promise: Promise.resolve({ status: "timeout", extra: "ignored" }),
    }),
  ).resolves.toEqual({ status: "timeout" });
  expect(
    getFlushResult({ kind: "RESULT", value: { status: "flushed" } }),
  ).toEqual({ status: "flushed" });
  expect(getFlushResult({ kind: "RESULT", value: "done" })).toEqual({
    status: "failed",
    error: expect.objectContaining({ code: "INVALID_ANSWER" }),
  });
});

test("a flushed or timed out answer is published as a frozen copy of itself", async () => {
  for (const answer of [{ status: "flushed" }, { status: "timeout" }]) {
    const result = await getFlushResult({
      kind: "RESULT",
      value: { ...answer, extra: "ignored" },
    });

    expect(result).toEqual(answer);
    expect(Object.isFrozen(result)).toBe(true);
  }
});

test("a failed flush keeps the error it failed with", async () => {
  const result = await getFlushResult({
    kind: "RESULT",
    value: { status: "failed", error: failure },
  });

  expect(result).toEqual({ status: "failed", error: failure });
  expect(result.status === "failed" ? result.error : null).toBe(failure);
  expect(Object.isFrozen(result)).toBe(true);
});

test("an answer with no status the contract allows becomes failed with TraceError INVALID_ANSWER", async () => {
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
    const result = await getFlushResult({ kind: "RESULT", value: answer });

    expect(getInvalidAnswer(result)).toEqual({
      code: "INVALID_ANSWER",
      message:
        "The adapter answered flush with a result its contract does not allow.",
    });
    expect(Object.isFrozen(result)).toBe(true);
  }
});

test("an answer whose fields throw when read is a failed result with that error, now or later, never a throw", async () => {
  const answer = {
    get status() {
      throw failure;
    },
  };

  expect(getFlushResult({ kind: "RESULT", value: answer })).toEqual({
    status: "failed",
    error: failure,
  });
  await expect(
    getFlushResult({ kind: "PENDING", promise: Promise.resolve(answer) }),
  ).resolves.toEqual({ status: "failed", error: failure });
});
