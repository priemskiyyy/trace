import { expect, test, vi } from "vitest";

import { isolate } from "./isolate.js";

const collectMicrotasks = () => {
  const tasks: (() => void)[] = [];

  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    tasks.push(task);
  });

  return tasks;
};

test("a throwing callback cannot break its caller and is rethrown outside it", () => {
  const tasks = collectMicrotasks();
  const failure = new Error("the callback failed");

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
  const failure = new Error("the callback failed");

  isolate(() => Promise.reject(failure));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toThrow(failure);
});

test("a callback that returns nothing, a value or a promise that resolves reports nothing", async () => {
  const tasks = collectMicrotasks();

  isolate(() => {});
  isolate(() => 1);
  isolate(() => Promise.resolve());
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(tasks).toEqual([]);
});

test("a promise whose constructor cannot be read is reported like a rejection, once, after the call returns", async () => {
  const tasks = collectMicrotasks();
  const thrown = new Error("constructor exploded");
  const answer = Promise.resolve("done");

  Object.defineProperty(answer, "constructor", {
    get() {
      throw thrown;
    },
  });

  isolate(() => answer);

  expect(tasks).toEqual([]);

  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toThrow(thrown);
});
