import { expect, test, vi } from "vitest";

import type { DestinationOutcome } from "src/types/DestinationOutcome";
import { createReceipt } from "src/utils/internal/dispatch/createReceipt";

const submitted: DestinationOutcome = {
  status: "submitted",
  evidence: "sdk-call-returned",
  event: null,
  losses: [],
};

const isDeepFrozen = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) {
    return true;
  }

  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
};

test("a receipt starts pending with a null slot for every destination", () => {
  const { receipt } = createReceipt({
    id: "event-1",
    destinations: ["product", "research"],
  });

  expect(receipt.id).toBe("event-1");
  expect(receipt.status.get()).toEqual({
    state: "pending",
    outcomes: { product: null, research: null },
  });
});

test("it settles once every destination has landed, and not before", async () => {
  const { receipt, land } = createReceipt({
    id: "event-1",
    destinations: ["product", "research"],
  });

  const settled = vi.fn();

  receipt.settled.then(settled);

  land("product", submitted);
  await Promise.resolve();

  expect(settled).not.toHaveBeenCalled();
  expect(receipt.status.get()).toEqual({
    state: "pending",
    outcomes: { product: submitted, research: null },
  });

  land("research", { status: "dropped", reason: "consent" });

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      product: submitted,
      research: { status: "dropped", reason: "consent" },
    },
  });
  expect(await receipt.settled).toBe(receipt.status.get());
});

test("the first landing for a destination stands and a second one is ignored, even while another is pending", () => {
  const { receipt, land } = createReceipt({
    id: "event-1",
    destinations: ["product", "research"],
  });

  land("product", { status: "indeterminate", reason: "timeout" });
  land("product", submitted);

  expect(receipt.status.get()).toEqual({
    state: "pending",
    outcomes: {
      product: { status: "indeterminate", reason: "timeout" },
      research: null,
    },
  });
});

test("a landing for a destination the receipt does not wait for is ignored", () => {
  const { receipt, land } = createReceipt({
    id: "event-1",
    destinations: ["product"],
  });

  // @ts-expect-error The caller named a destination this receipt was not created for.
  land("research", submitted);
  // @ts-expect-error The caller named a key every object inherits.
  land("toString", submitted);

  expect(receipt.status.get()).toEqual({
    state: "pending",
    outcomes: { product: null },
  });
});

test("a receipt settles exactly once, and observers hear each landing until it does", async () => {
  const { receipt, land } = createReceipt({
    id: "event-1",
    destinations: ["product", "research"],
  });

  const listener = vi.fn();

  receipt.status.subscribe(listener);

  land("product", submitted);
  land("research", submitted);

  const final = receipt.status.get();

  land("research", { status: "failed", error: new Error("late") });

  expect(listener.mock.calls).toEqual([[], []]);
  expect(receipt.status.get()).toBe(final);
  expect(final).toEqual({
    state: "settled",
    outcomes: { product: submitted, research: submitted },
  });
  await expect(receipt.settled).resolves.toBe(final);
});

test("settled never rejects, whatever the destinations answered", async () => {
  const { receipt, land } = createReceipt({
    id: "event-1",
    destinations: ["product", "research"],
  });

  const failure = new Error("offline");

  land("product", { status: "failed", error: failure });
  land("research", { status: "indeterminate", reason: "timeout" });

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      product: { status: "failed", error: failure },
      research: { status: "indeterminate", reason: "timeout" },
    },
  });
});

test("every status a receipt hands out is frozen, down to its outcomes", () => {
  const { receipt, land } = createReceipt({
    id: "event-1",
    destinations: ["product", "research"],
  });

  const pending = receipt.status.get();

  land("product", { status: "skipped", reason: "unsupported" });

  const partial = receipt.status.get();

  land("research", { status: "dropped", reason: "buffer-overflow" });

  const final = receipt.status.get();

  expect(final).toEqual({
    state: "settled",
    outcomes: {
      product: { status: "skipped", reason: "unsupported" },
      research: { status: "dropped", reason: "buffer-overflow" },
    },
  });
  expect([pending, partial, final].every(isDeepFrozen)).toBe(true);
});

test("a receipt with no destination to wait for is settled from the start", async () => {
  const { receipt } = createReceipt({ id: "event-1", destinations: [] });

  expect(receipt.status.get()).toEqual({ state: "settled", outcomes: {} });
  await expect(receipt.settled).resolves.toBe(receipt.status.get());
});

test("a destination named __proto__ gets a slot of its own, so the receipt waits for it", () => {
  const { receipt, land } = createReceipt({
    id: "event-1",
    destinations: ["product", "__proto__"],
  });

  land("product", submitted);

  expect(receipt.status.get().state).toBe("pending");

  land("__proto__", submitted);

  const final = receipt.status.get();

  expect(final.state).toBe("settled");
  expect(
    final.state === "settled"
      ? Object.getOwnPropertyDescriptor(final.outcomes, "__proto__")?.value
      : null,
  ).toBe(submitted);
});

test("a landing made from inside a status listener settles the receipt once", async () => {
  const { receipt, land } = createReceipt({
    id: "event-1",
    destinations: ["product", "research"],
  });

  const states: string[] = [];

  receipt.status.subscribe(() => {
    const current = receipt.status.get();

    states.push(current.state);

    if (current.state === "pending" && current.outcomes.research === null) {
      land("research", { status: "dropped", reason: "consent" });
    }
  });

  land("product", submitted);

  const final = receipt.status.get();

  expect(states).toEqual(["pending", "settled"]);
  expect(final).toEqual({
    state: "settled",
    outcomes: {
      product: submitted,
      research: { status: "dropped", reason: "consent" },
    },
  });
  await expect(receipt.settled).resolves.toBe(final);
});

test("the settled callback runs once, before any listener hears the settled status", () => {
  const log: string[] = [];

  const { receipt, land } = createReceipt({
    id: "event-1",
    destinations: ["product", "research"],
    onSettled: () => log.push("settled"),
  });

  receipt.status.subscribe(() =>
    log.push(`listener ${receipt.status.get().state}`),
  );

  land("product", submitted);
  land("research", submitted);
  land("research", submitted);

  expect(log).toEqual(["listener pending", "settled", "listener settled"]);
});

test("a receipt with nothing to wait for runs its settled callback at once", () => {
  const onSettled = vi.fn();

  createReceipt({ id: "event-1", destinations: [], onSettled });

  expect(onSettled.mock.calls).toEqual([[]]);
});

test("the receipt and its status are frozen, and a listener hears the landing that settles it", () => {
  const { receipt, land } = createReceipt({
    id: "event-1",
    destinations: ["product"],
    onSettled: () => {},
  });

  const listener = vi.fn();

  receipt.status.subscribe(listener);
  land("product", submitted);

  expect(Object.isFrozen(receipt)).toBe(true);
  expect(Object.isFrozen(receipt.status)).toBe(true);
  expect(Object.keys(receipt.status)).toEqual(["get", "subscribe"]);
  expect(listener.mock.calls).toEqual([[]]);
});
