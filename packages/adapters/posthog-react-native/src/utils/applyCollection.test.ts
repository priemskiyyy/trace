import { expect, test } from "vitest";

import { fakePostHog } from "src/fakePostHog.fixture";
import { applyCollection } from "src/utils/applyCollection";

test("collection on opts in, and answers the client's promise", async () => {
  const fake = fakePostHog({ defaultOptIn: false, hold: ["optIn"] });

  let settled = false;

  const switching = applyCollection(fake.sdk, true).then(() => {
    settled = true;
  });

  await Promise.resolve();

  expect(fake.calls).toStrictEqual([{ method: "optIn", args: [] }]);
  expect(fake.state.optedOut).toBe(false);
  expect(settled).toBe(false);

  fake.held.forEach((release) => release());
  await switching;

  expect(settled).toBe(true);
});

test("collection off opts out, and rejects with the client's promise", async () => {
  const fake = fakePostHog();
  const failure = new Error("Storage is full");

  fake.state.failures.optOut = failure;

  await expect(applyCollection(fake.sdk, false)).rejects.toBe(failure);
  expect(fake.calls).toStrictEqual([{ method: "optOut", args: [] }]);
  expect(fake.state.optedOut).toBe(true);
});
