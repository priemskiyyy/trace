import { expect, test } from "vitest";

import { getFlushResult } from "src/utils/internal/destinations/getFlushResult";

const failure = new Error("upload failed");

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
