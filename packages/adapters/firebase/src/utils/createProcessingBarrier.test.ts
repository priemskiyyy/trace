import { expect, test, vi } from "vitest";

import { createProcessingBarrier } from "src/utils/createProcessingBarrier";

const WITHDRAWN = expect.objectContaining({
  name: "TraceError",
  code: "DELIVERY_FAILED",
  message:
    "The identity change was withdrawn before Firebase had processed the events ahead of it, so it never reached Firebase.",
});

test("a change with no event being processed applies at once and gives nothing to wait for", () => {
  const barrier = createProcessingBarrier();
  const apply = vi.fn();

  expect(barrier.run(apply)).toBeUndefined();
  expect(apply.mock.calls).toEqual([[]]);
});

test("a change waits until every event begun before it was processed, and a repeated callback counts once", async () => {
  const barrier = createProcessingBarrier();
  const first = barrier.begin();
  const second = barrier.begin();
  const apply = vi.fn();
  const change = barrier.run(apply);

  first();
  first();

  expect(apply.mock.calls).toEqual([]);

  second();

  expect(apply.mock.calls).toEqual([[]]);
  await expect(change).resolves.toBeUndefined();
});

test("a later change replaces the waiting one, whoever made it, and the replaced one is withdrawn and never applied", async () => {
  const barrier = createProcessingBarrier();
  const processed = barrier.begin();
  const stale = vi.fn();
  const latest = vi.fn();
  const replaced = barrier.run(stale);
  const change = barrier.run(latest);

  await expect(replaced).rejects.toEqual(WITHDRAWN);

  processed();

  await expect(change).resolves.toBeUndefined();
  expect(stale.mock.calls).toEqual([]);
  expect(latest.mock.calls).toEqual([[]]);
});

test("cancel withdraws the waiting change and forgets no event", async () => {
  const barrier = createProcessingBarrier();
  const processed = barrier.begin();
  const withdrawnApply = vi.fn();
  const withdrawn = barrier.run(withdrawnApply);

  barrier.cancel();

  await expect(withdrawn).rejects.toEqual(WITHDRAWN);

  const next = vi.fn();
  const waiting = barrier.run(next);

  expect(next.mock.calls).toEqual([]);

  processed();

  await expect(waiting).resolves.toBeUndefined();
  expect(withdrawnApply.mock.calls).toEqual([]);
  expect(next.mock.calls).toEqual([[]]);
});

test("cancel with nothing waiting changes nothing", () => {
  const barrier = createProcessingBarrier();
  const apply = vi.fn();

  barrier.cancel();

  expect(barrier.run(apply)).toBeUndefined();
  expect(apply.mock.calls).toEqual([[]]);
});

test("a change that throws while it is applied rejects with that error and the callback does not throw", async () => {
  const barrier = createProcessingBarrier();
  const processed = barrier.begin();
  const error = new Error("setUserId failed");

  const failing = barrier.run(() => {
    throw error;
  });

  expect(() => processed()).not.toThrow();
  await expect(failing).rejects.toBe(error);
});

test("a change made after every event was processed applies at once", () => {
  const barrier = createProcessingBarrier();
  const processed = barrier.begin();
  const apply = vi.fn();

  processed();

  expect(barrier.run(apply)).toBeUndefined();
  expect(apply.mock.calls).toEqual([[]]);
});
