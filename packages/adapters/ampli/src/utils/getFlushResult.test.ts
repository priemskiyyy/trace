import type { FlushResult } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { getFlushResult } from "src/utils/getFlushResult";

const watch = (answer: Promise<FlushResult>) => {
  const watched: { result: FlushResult | null; done: Promise<void> } = {
    result: null,
    done: answer.then((result) => {
      watched.result = result;
    }),
  };

  return watched;
};

test("answers flushed once Amplitude's flush resolved and every upload settled with a 2xx code", async () => {
  let finish: (result: { code: number }) => void = () => {};

  const upload = new Promise<{ code: number }>((resolve) => {
    finish = resolve;
  });

  const watched = watch(
    getFlushResult(Promise.resolve(), [Promise.resolve({ code: 200 }), upload]),
  );

  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  expect(watched.result).toBe(null);

  finish({ code: 204 });
  await watched.done;

  expect(watched.result).toStrictEqual({ status: "flushed" });
});

test("answers failed with DELIVERY_FAILED naming how many uploads Amplitude did not accept", async () => {
  const result = await getFlushResult(Promise.resolve(), [
    Promise.resolve({ code: 200 }),
    Promise.resolve({ code: 0 }),
    Promise.resolve({ code: 199 }),
    Promise.resolve({ code: 300 }),
    Promise.resolve({ code: 500 }),
    Promise.resolve(),
  ]);

  expect(result).toStrictEqual({
    status: "failed",
    error: expect.objectContaining({
      name: "TraceError",
      code: "DELIVERY_FAILED",
      message:
        "Amplitude did not accept 5 of the uploads this flush waited for.",
    }),
  });
});
