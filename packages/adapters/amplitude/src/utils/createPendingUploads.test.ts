import { expect, test } from "vitest";

import { createPendingUploads } from "src/utils/createPendingUploads";

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

test("an upload stays pending until it settles, whether Amplitude resolves or rejects it", async () => {
  const uploads = createPendingUploads();
  const answered = hold();
  const rejected = hold();

  uploads.add(answered.promise);
  uploads.add(rejected.promise);

  expect(uploads.values()).toStrictEqual([answered.promise, rejected.promise]);

  answered.resolve({ code: 200 });
  await answered.promise;

  expect(uploads.values()).toStrictEqual([rejected.promise]);

  rejected.reject(new Error("offline"));
  await rejected.promise.catch(() => {});

  expect(uploads.values()).toStrictEqual([]);
});
