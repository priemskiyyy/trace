import type { FlushResult } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { createUploads } from "src/utils/createUploads";

type Uploads = ReturnType<typeof createUploads>;

const hold = () => {
  const held: { resolve: (result: { code: number }) => void } = {
    resolve: () => {},
  };

  const promise = new Promise<{ code: number } | void>((resolve) => {
    held.resolve = resolve;
  });

  return { promise, resolve: held.resolve };
};

const getDeliveryFailed = (count: number) => ({
  status: "failed",
  error: expect.objectContaining({
    name: "TraceError",
    code: "DELIVERY_FAILED",
    message: `Amplitude did not accept ${count} of this destination's uploads since the last flush.`,
  }),
});

const flush = (uploads: Uploads, signal = new AbortController().signal) =>
  uploads.flush(Promise.resolve(), signal);

const settle = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

test("answers flushed once Amplitude's flush resolved and every upload in flight when it began settled with a 2xx code", async () => {
  const uploads = createUploads();
  const upload = hold();
  const flushing: { result: FlushResult | null } = { result: null };

  uploads.add(Promise.resolve({ code: 200 }));
  uploads.add(upload.promise);
  flush(uploads).then((result) => {
    flushing.result = result;
  });
  await settle();

  expect(flushing.result).toBe(null);

  upload.resolve({ code: 204 });
  await settle();

  expect(flushing.result).toStrictEqual({ status: "flushed" });
});

test("answers failed with DELIVERY_FAILED naming how many uploads Amplitude did not accept, answered with nothing, or that rejected", async () => {
  const uploads = createUploads();

  for (const code of [200, 299, 0, 199, 300, 500]) {
    uploads.add(Promise.resolve({ code }));
  }

  uploads.add(Promise.resolve());
  uploads.add(Promise.reject(new Error("offline")));

  await expect(flush(uploads)).resolves.toStrictEqual(getDeliveryFailed(6));
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
