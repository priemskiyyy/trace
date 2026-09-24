import { TraceError } from "@priemskiyyy/trace";
import type { FlushResult } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { getFlushResult } from "src/utils/getFlushResult";

const hold = () => {
  const held: { resolve: (result: { code: number }) => void } = {
    resolve: () => {},
  };

  const promise = new Promise<{ code: number }>((resolve) => {
    held.resolve = resolve;
  });

  return { promise, resolve: held.resolve };
};

const drain = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

test("flushed once Amplitude's own flush and every upload it waited for answered 2xx", async () => {
  await expect(
    getFlushResult(Promise.resolve(), [
      Promise.resolve({ code: 200 }),
      Promise.resolve({ code: 299 }),
    ]),
  ).resolves.toStrictEqual({ status: "flushed" });
});

test("it waits for every upload, not only for Amplitude's flush, which answers first", async () => {
  const upload = hold();
  const flush: { result: FlushResult | null } = { result: null };

  getFlushResult(Promise.resolve(), [upload.promise]).then((result) => {
    flush.result = result;
  });
  await drain();

  expect(flush.result).toBe(null);

  upload.resolve({ code: 200 });
  await drain();

  expect(flush.result).toStrictEqual({ status: "flushed" });
});

test("failed with DELIVERY_FAILED, counting the uploads Amplitude answered outside 2xx", async () => {
  await expect(
    getFlushResult(Promise.resolve(), [
      Promise.resolve({ code: 200 }),
      Promise.resolve({ code: 199 }),
      Promise.resolve({ code: 300 }),
      Promise.resolve({ code: 413 }),
      Promise.resolve({ code: 0 }),
    ]),
  ).resolves.toStrictEqual({
    status: "failed",
    error: new TraceError({
      code: "DELIVERY_FAILED",
      message:
        "Amplitude did not accept 4 of the uploads this flush waited for.",
    }),
  });
});

test("a flush or an upload that rejects passes its error on, which Trace reports as failed", async () => {
  const offline = new Error("offline");

  await expect(getFlushResult(Promise.reject(offline), [])).rejects.toBe(
    offline,
  );
  await expect(
    getFlushResult(Promise.resolve(), [Promise.reject(offline)]),
  ).rejects.toBe(offline);
});
