import { TraceError } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { createRequests } from "src/utils/createRequests";

type Callback = (error: Error | undefined) => void;

const REFUSED = new Error("Mixpanel Server Error: 0");

const hold = () => {
  const callbacks: Callback[] = [];

  const held = {
    starts: 0,
    call: (callback: Callback) => {
      held.starts += 1;
      callbacks.push(callback);
    },
    answer: (error?: Error) => {
      for (const callback of callbacks.splice(0)) {
        callback(error);
      }
    },
  };

  return held;
};

const getDeliveryFailed = (count: number) => ({
  status: "failed",
  error: new TraceError({
    code: "DELIVERY_FAILED",
    message: `Mixpanel did not accept ${count} of the requests sent since the last flush.`,
  }),
});

const createFlushContext = (signal = new AbortController().signal) => ({
  timeout: 1_000,
  signal,
});

const nextMacrotask = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const watch = (answer: Promise<unknown>) => {
  const watched: { settled: boolean; result: unknown } = {
    settled: false,
    result: null,
  };

  answer.then((result) => {
    watched.settled = true;
    watched.result = result;
  });

  return watched;
};

test("a request resolves when Mixpanel answers without an error, and rejects with the error it answers", async () => {
  const requests = createRequests();

  await expect(
    requests.send((callback) => {
      callback(undefined);
    }),
  ).resolves.toBeUndefined();
  await expect(
    requests.send((callback) => {
      callback(REFUSED);
    }),
  ).rejects.toBe(REFUSED);
});

test("a call that throws rejects its request with what it threw", async () => {
  const requests = createRequests();
  const thrown = new Error("Unsupported protocol");

  await expect(
    requests.send(() => {
      throw thrown;
    }),
  ).rejects.toBe(thrown);
});

test("a sent request starts at once, without waiting for the queued ones", async () => {
  const requests = createRequests();
  const queued = hold();
  const sent = hold();

  requests.queue(queued.call);
  requests.send(sent.call);
  await nextMacrotask();

  expect([queued.starts, sent.starts]).toStrictEqual([1, 1]);

  queued.answer();
  sent.answer();
});

test("a queued request starts only once Mixpanel answered the one queued before it, refused or not", async () => {
  const requests = createRequests();
  const first = hold();
  const second = hold();
  const third = hold();

  requests.queue(first.call);
  requests.queue(second.call);
  requests.queue(third.call);
  await nextMacrotask();

  expect([first.starts, second.starts, third.starts]).toStrictEqual([1, 0, 0]);

  first.answer(REFUSED);
  await nextMacrotask();

  expect([second.starts, third.starts]).toStrictEqual([1, 0]);

  second.answer();
  await nextMacrotask();

  expect(third.starts).toBe(1);

  third.answer();
});

test("a queued call that throws counts as refused, and the request queued after it still starts", async () => {
  const requests = createRequests();
  const next = hold();

  requests.queue(() => {
    throw new Error("Unsupported protocol");
  });
  requests.queue(next.call);
  await nextMacrotask();

  expect(next.starts).toBe(1);

  next.answer();

  await expect(requests.flush(createFlushContext())).resolves.toStrictEqual(
    getDeliveryFailed(1),
  );
});

test("flush waits for every request sent or queued before it, one that has not started yet included, and answers flushed once Mixpanel accepted them all", async () => {
  const requests = createRequests();
  const sent = hold();
  const first = hold();
  const second = hold();

  requests.send(sent.call);
  requests.queue(first.call);
  requests.queue(second.call);

  const flushing = watch(requests.flush(createFlushContext()));

  sent.answer();
  await nextMacrotask();
  first.answer();
  await nextMacrotask();

  expect(second.starts).toBe(1);
  expect(flushing.settled).toBe(false);

  second.answer();
  await nextMacrotask();

  expect(flushing.result).toStrictEqual({ status: "flushed" });
});

test("flush answers failed with DELIVERY_FAILED, counting the requests Mixpanel did not accept", async () => {
  const requests = createRequests();
  const accepted = hold();
  const refused = hold();
  const queued = hold();

  requests.send(accepted.call);
  requests.send(refused.call);
  requests.queue(queued.call);

  const flushing = requests.flush(createFlushContext());

  await nextMacrotask();
  accepted.answer();
  refused.answer(REFUSED);
  queued.answer(REFUSED);

  await expect(flushing).resolves.toStrictEqual(getDeliveryFailed(2));
});

test("a request Mixpanel refused before a flush began is reported by that flush, and by no later one", async () => {
  const requests = createRequests();

  await requests
    .send((callback) => {
      callback(REFUSED);
    })
    .catch(() => {});

  await expect(requests.flush(createFlushContext())).resolves.toStrictEqual(
    getDeliveryFailed(1),
  );
  await expect(requests.flush(createFlushContext())).resolves.toStrictEqual({
    status: "flushed",
  });
});

test("a flush whose signal aborts while a request is in flight, which Mixpanel then refuses, leaves the refusal to the next flush, and the one after answers flushed", async () => {
  const requests = createRequests();
  const request = hold();
  const controller = new AbortController();

  requests.send(request.call);

  const abandoned = requests.flush(createFlushContext(controller.signal));

  controller.abort();
  request.answer(REFUSED);

  await expect(abandoned).resolves.toStrictEqual(getDeliveryFailed(1));
  await expect(requests.flush(createFlushContext())).resolves.toStrictEqual(
    getDeliveryFailed(1),
  );
  await expect(requests.flush(createFlushContext())).resolves.toStrictEqual({
    status: "flushed",
  });
});

test("two overlapping flushes over one refused request both answer failed", async () => {
  const requests = createRequests();
  const request = hold();

  requests.send(request.call);

  const first = requests.flush(createFlushContext());
  const second = requests.flush(createFlushContext());

  request.answer(REFUSED);

  await expect(Promise.all([first, second])).resolves.toStrictEqual([
    getDeliveryFailed(1),
    getDeliveryFailed(1),
  ]);
  await expect(requests.flush(createFlushContext())).resolves.toStrictEqual({
    status: "flushed",
  });
});

test("a request sent or queued after the flush began does not extend it", async () => {
  const requests = createRequests();
  const sent = hold();
  const queued = hold();
  const flushing = requests.flush(createFlushContext());

  requests.send(sent.call);
  requests.queue(queued.call);

  await expect(flushing).resolves.toStrictEqual({ status: "flushed" });

  sent.answer();
  await nextMacrotask();
  queued.answer();
});

test("a flush with nothing sent answers flushed at once", async () => {
  await expect(
    createRequests().flush(createFlushContext()),
  ).resolves.toStrictEqual({
    status: "flushed",
  });
});
