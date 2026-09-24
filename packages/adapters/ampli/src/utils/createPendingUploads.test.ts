import { expect, test } from "vitest";

import { createPendingUploads } from "src/utils/createPendingUploads";

const hold = () => {
  const held: {
    promise: Promise<{ code: number } | void>;
    resolve: (result: { code: number }) => void;
    reject: (error: unknown) => void;
  } = {
    promise: Promise.resolve(),
    resolve: () => {},
    reject: () => {},
  };

  held.promise = new Promise((resolve, reject) => {
    held.resolve = resolve;
    held.reject = reject;
  });

  return held;
};

test("an upload is pending until it settles, whether it resolves or rejects", async () => {
  const uploads = createPendingUploads();
  const first = hold();
  const second = hold();

  uploads.add(first.promise);
  uploads.add(second.promise);

  expect(uploads.values()).toStrictEqual([first.promise, second.promise]);

  first.resolve({ code: 200 });
  await first.promise;

  expect(uploads.values()).toStrictEqual([second.promise]);

  second.reject(new Error("upload failed"));
  await second.promise.catch(() => {});

  expect(uploads.values()).toStrictEqual([]);
});

test("values answers a list of its own, so a later settle never changes one already taken", async () => {
  const uploads = createPendingUploads();
  const upload = hold();

  uploads.add(upload.promise);

  const taken = uploads.values();

  upload.resolve({ code: 200 });
  await upload.promise;

  expect(taken).toStrictEqual([upload.promise]);
  expect(uploads.values()).toStrictEqual([]);
});
