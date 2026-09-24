import { expect, test, vi } from "vitest";

import { createDroppedReceipt } from "src/utils/internal/dispatch/createDroppedReceipt";

const isDeepFrozen = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) {
    return true;
  }

  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
};

test("a dropped event's receipt is final at once with its reason, and nothing can move it", async () => {
  const receipt = createDroppedReceipt({
    id: "event-1",
    reason: "consent",
    issues: [],
  });

  const listener = vi.fn();
  const stop = receipt.status.subscribe(listener);

  stop();

  expect(receipt.id).toBe("event-1");
  expect(receipt.status.get()).toEqual({ state: "dropped", reason: "consent" });
  expect(Object.isFrozen(receipt)).toBe(true);
  expect(Object.isFrozen(receipt.status)).toBe(true);
  expect(Object.isFrozen(receipt.status.get())).toBe(true);
  expect(listener).not.toHaveBeenCalled();
  await expect(receipt.settled).resolves.toBe(receipt.status.get());
});

test("an invalid event's receipt carries its issues, copied and frozen", async () => {
  const issue = { path: "cart.id", message: "Expected a string." };
  const issues = [issue];

  const receipt = createDroppedReceipt({
    id: "event-1",
    reason: "invalid",
    issues,
  });

  issue.message = "changed by the caller";
  issues.push({ path: "value", message: "changed by the caller" });

  expect(receipt.status.get()).toEqual({
    state: "dropped",
    reason: "invalid",
    issues: [{ path: "cart.id", message: "Expected a string." }],
  });
  expect(isDeepFrozen(receipt.status.get())).toBe(true);
  await expect(receipt.settled).resolves.toBe(receipt.status.get());
});
