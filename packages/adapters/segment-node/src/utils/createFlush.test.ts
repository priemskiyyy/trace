import type { FlushResult } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { fakeSegment } from "src/fakeSegment.fixture";
import { createFlush } from "src/utils/createFlush";

const queueOne = ({ sdk }: ReturnType<typeof fakeSegment>) => {
  sdk.track({
    userId: "ada",
    event: "App Opened",
    properties: {},
    timestamp: new Date(0),
    messageId: "3f0b6f64-6c1e-4d7a-9a4e-2b9c1d3e5f70",
  });
};

const getMethods = ({ calls }: ReturnType<typeof fakeSegment>) =>
  calls.map(([method]) => method);

const nextMacrotask = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const watch = (promise: Promise<FlushResult>) => {
  const watched: { result: FlushResult | null } = { result: null };

  promise.then((result) => {
    watched.result = result;
  });

  return watched;
};

test("a flush answers flushed once analytics-node's flush has resolved", async () => {
  const fake = fakeSegment();
  const flush = createFlush(fake.sdk);

  queueOne(fake);

  const flushing = watch(flush());

  await nextMacrotask();

  expect(flushing.result).toBe(null);

  fake.send();
  await nextMacrotask();

  expect(flushing.result).toStrictEqual({ status: "flushed" });
  expect(getMethods(fake)).toStrictEqual(["track", "flush"]);
});

test("a flush that overlaps a pending one waits for it instead of calling analytics-node's flush, which would resolve at once", async () => {
  const fake = fakeSegment();
  const flush = createFlush(fake.sdk);

  queueOne(fake);

  const earlier = watch(flush());
  const later = watch(flush());

  await nextMacrotask();

  expect([earlier.result, later.result]).toStrictEqual([null, null]);

  fake.send();
  await nextMacrotask();

  expect([earlier.result, later.result]).toStrictEqual([
    { status: "flushed" },
    { status: "flushed" },
  ]);
  expect(getMethods(fake)).toStrictEqual(["track", "flush"]);
  expect(fake.state.warnings).toBe(0);
});

test("once the pending flush has settled, the next flush calls analytics-node's flush again", async () => {
  const fake = fakeSegment();
  const flush = createFlush(fake.sdk);

  await flush();
  queueOne(fake);

  const flushing = flush();

  fake.send();

  await expect(flushing).resolves.toStrictEqual({ status: "flushed" });
  expect(getMethods(fake)).toStrictEqual(["flush", "track", "flush"]);
});
