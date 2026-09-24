import { expect, test, vi } from "vitest";

import { isolate } from "src/utils/common/isolate";

const collectMicrotasks = () => {
  const tasks: Array<() => void> = [];

  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    tasks.push(task);
  });

  return tasks;
};

test("a throwing callback cannot break its caller and is rethrown outside the chain", () => {
  const tasks = collectMicrotasks();
  const failure = new Error("listener failed");

  expect(() =>
    isolate(() => {
      throw failure;
    }),
  ).not.toThrow();

  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toThrow(failure);
});

test("a callback whose promise rejects is reported the same way", async () => {
  const tasks = collectMicrotasks();
  const failure = new Error("async listener failed");

  isolate(() => Promise.reject(failure));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toThrow(failure);
});

test("a callback that returns nothing schedules nothing", () => {
  const tasks = collectMicrotasks();
  const failed = vi.fn();

  isolate(() => {}, failed);
  isolate(() => 1, failed);

  expect(tasks).toEqual([]);
  expect(failed.mock.calls).toEqual([]);
});

test("the failure callback hears a throw at once, and a rejection when it lands, each before the error is rethrown", async () => {
  const tasks = collectMicrotasks();
  const failure = new Error("listener failed");
  const log: string[] = [];

  isolate(
    () => {
      throw failure;
    },
    () => log.push(`failed with ${tasks.length} rethrown`),
  );

  expect(log).toEqual(["failed with 0 rethrown"]);

  isolate(
    () => Promise.reject(failure),
    () => log.push(`failed with ${tasks.length} rethrown`),
  );

  expect(log).toEqual(["failed with 0 rethrown"]);

  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(log).toEqual(["failed with 0 rethrown", "failed with 1 rethrown"]);
  expect(tasks).toHaveLength(2);
  expect(tasks[1]).toThrow(failure);
});

test.each(["constructor", "then"])(
  "a promise whose %s cannot be read fails like a rejection, reported once after the call returns",
  async (key) => {
    const tasks = collectMicrotasks();
    const thrown = new Error(`${key} exploded`);
    const answer = Promise.resolve("done");
    const log: string[] = [];

    Object.defineProperty(answer, key, {
      get() {
        throw thrown;
      },
    });

    isolate(
      () => answer,
      () => log.push("failed"),
    );
    log.push("returned");

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(log).toEqual(["returned", "failed"]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toThrow(thrown);
  },
);
