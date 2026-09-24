import { TraceError } from "@priemskiyyy/trace";
import type { FlushResult } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { createUploads } from "src/utils/createUploads";

type Uploads = ReturnType<typeof createUploads>;

const hold = () => {
  const held: {
    resolve: (result: { code: number }) => void;
    reject: (error: unknown) => void;
  } = { resolve: () => {}, reject: () => {} };

  const promise = new Promise<{ code: number }>((resolve, reject) => {
    held.resolve = resolve;
    held.reject = reject;
  });

  return { promise, resolve: held.resolve, reject: held.reject };
};

const getDeliveryFailed = (count: number) => ({
  status: "failed",
  error: new TraceError({
    code: "DELIVERY_FAILED",
    message: `Amplitude did not accept ${count} of this destination's uploads since the last flush.`,
  }),
});

const flush = (uploads: Uploads, signal = new AbortController().signal) =>
  uploads.flush(Promise.resolve(), signal);

const nextMacrotask = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

test("a flush answers flushed once Amplitude's own flush and every upload in flight when it began answered 2xx", async () => {
  const uploads = createUploads();

  uploads.add(Promise.resolve({ code: 200 }));
  uploads.add(Promise.resolve({ code: 299 }));

  await expect(flush(uploads)).resolves.toStrictEqual({ status: "flushed" });
});

test("a flush waits for every upload in flight when it began, not only for Amplitude's own flush, which answers first", async () => {
  const uploads = createUploads();
  const upload = hold();
  const flushing: { result: FlushResult | null } = { result: null };

  uploads.add(upload.promise);
  flush(uploads).then((result) => {
    flushing.result = result;
  });
  await nextMacrotask();

  expect(flushing.result).toBe(null);

  upload.resolve({ code: 200 });
  await nextMacrotask();

  expect(flushing.result).toStrictEqual({ status: "flushed" });
});

test("a flush answers failed with DELIVERY_FAILED, counting each upload Amplitude answered outside 2xx or that rejected", async () => {
  const uploads = createUploads();

  for (const code of [199, 200, 299, 300, 413, 0]) {
    uploads.add(Promise.resolve({ code }));
  }

  uploads.add(Promise.reject(new Error("offline")));

  await expect(flush(uploads)).resolves.toStrictEqual(getDeliveryFailed(5));
});

test("a flush whose own Amplitude flush rejects passes its error on", async () => {
  const offline = new Error("offline");

  await expect(
    createUploads().flush(
      Promise.reject(offline),
      new AbortController().signal,
    ),
  ).rejects.toBe(offline);
});

test("an upload that resolves nothing, which only an SDK breaking its type can do, counts as refused, the next flush answers failed, and no rejection goes unhandled", async () => {
  const uploads = createUploads();
  const unhandled: unknown[] = [];

  const handleUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };

  process.on("unhandledRejection", handleUnhandled);
  // @ts-expect-error Amplitude resolves every upload with its result, which this one breaks.
  uploads.add(Promise.resolve(undefined));
  await nextMacrotask();
  process.off("unhandledRejection", handleUnhandled);

  expect(unhandled).toStrictEqual([]);
  await expect(flush(uploads)).resolves.toStrictEqual(getDeliveryFailed(1));
  await expect(flush(uploads)).resolves.toStrictEqual({ status: "flushed" });
});

test("an upload a flush waits for that rejects or resolves nothing is counted before that flush answers", async () => {
  const uploads = createUploads();
  const rejected = hold();
  const broken = hold();

  uploads.add(rejected.promise);
  uploads.add(broken.promise);

  const flushing = flush(uploads);

  rejected.reject(new Error("offline"));
  // @ts-expect-error Amplitude resolves every upload with its result, which this one breaks.
  broken.resolve(undefined);

  await expect(flushing).resolves.toStrictEqual(getDeliveryFailed(2));
});

test("an upload refused before the flush makes the flush failed, and the next flush answers flushed", async () => {
  const uploads = createUploads();
  const refused = Promise.resolve({ code: 500 });

  uploads.add(refused);
  await refused;

  await expect(flush(uploads)).resolves.toStrictEqual(getDeliveryFailed(1));
  await expect(flush(uploads)).resolves.toStrictEqual({ status: "flushed" });
});

test("a flush whose signal aborts while an upload is in flight, which is then refused, leaves the refusal to the next flush, and the one after answers flushed", async () => {
  const uploads = createUploads();
  const upload = hold();
  const controller = new AbortController();

  uploads.add(upload.promise);

  const abandoned = flush(uploads, controller.signal);

  controller.abort();
  upload.resolve({ code: 500 });

  await expect(abandoned).resolves.toStrictEqual(getDeliveryFailed(1));
  await expect(flush(uploads)).resolves.toStrictEqual(getDeliveryFailed(1));
  await expect(flush(uploads)).resolves.toStrictEqual({ status: "flushed" });
});

test("two overlapping flushes over one refused upload both answer failed", async () => {
  const uploads = createUploads();
  const upload = hold();

  uploads.add(upload.promise);

  const first = flush(uploads);
  const second = flush(uploads);

  upload.resolve({ code: 500 });

  await expect(Promise.all([first, second])).resolves.toStrictEqual([
    getDeliveryFailed(1),
    getDeliveryFailed(1),
  ]);
  await expect(flush(uploads)).resolves.toStrictEqual({ status: "flushed" });
});

test("an upload added after a flush began does not hold it", async () => {
  const uploads = createUploads();
  const later = hold();
  const flushing = flush(uploads);

  uploads.add(later.promise);

  await expect(flushing).resolves.toStrictEqual({ status: "flushed" });

  later.resolve({ code: 200 });
});
