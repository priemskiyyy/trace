import { expect, test } from "vitest";

import { createDeferred } from "src/utils/common/createDeferred";

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a deferred promise settles from outside with the value or the reason it is given", async () => {
  const resolved = createDeferred<number>();

  resolved.resolve(1);
  await expect(resolved.promise).resolves.toBe(1);

  const failure = new Error("handoff failed");
  const rejected = createDeferred();

  rejected.reject(failure);
  await expect(rejected.promise).rejects.toBe(failure);
});

test("a rejection nobody awaited raises no unhandled rejection", async () => {
  const unhandled: unknown[] = [];

  const handleUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };

  process.on("unhandledRejection", handleUnhandled);

  const { promise, reject } = createDeferred();

  reject(new Error("handoff failed"));
  await macrotask();
  process.off("unhandledRejection", handleUnhandled);

  expect(unhandled).toEqual([]);
  await expect(promise).rejects.toThrow("handoff failed");
});
