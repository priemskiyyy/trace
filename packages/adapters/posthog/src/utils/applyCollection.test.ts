import { expect, test } from "vitest";

import { fakePostHog } from "src/fakePostHog.fixture";
import { applyCollection } from "src/utils/applyCollection";

test("collection on opts in without the $opt_in event posthog-js would capture", () => {
  const fake = fakePostHog({ config: { opt_out_capturing_by_default: true } });

  applyCollection(fake.sdk, true);

  expect(fake.calls.opt_in_capturing).toStrictEqual([
    { captureEventName: false },
  ]);
  expect(fake.state.optedOut).toBe(false);
  expect(fake.captured).toStrictEqual([]);
});

test("collection off opts out", () => {
  const fake = fakePostHog();

  applyCollection(fake.sdk, false);

  expect(fake.calls.opt_out_capturing).toBe(1);
  expect(fake.calls.opt_in_capturing).toStrictEqual([]);
  expect(fake.state.optedOut).toBe(true);
});
