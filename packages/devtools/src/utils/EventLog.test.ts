import type { TraceDiagnosticEvent, TrackedEvent } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { EventLog } from "src/utils/EventLog";

const diagnostic = (
  type: string,
  context: unknown = null,
  source: TraceDiagnosticEvent["source"] = "destination",
): TraceDiagnosticEvent => ({
  source,
  type,
  destination: { name: "product" },
  event: { id: "e_1" },
  timestamp: 1_000,
  context,
});

const tracked: TrackedEvent<string, unknown> = {
  id: "e_1",
  name: "Checkout Started",
  properties: { plan: "pro" },
  context: {},
  identity: { generation: 1, user: { id: "ada" }, traits: {}, groups: {} },
  timestamp: 1_000,
};

test("keeps the newest events first within the limit and notifies once per microtask", async () => {
  const log = new EventLog();
  let notifications = 0;

  log.setLimit(2);

  log.subscribe(() => {
    notifications += 1;
  });

  log.add(diagnostic("destination failed"));
  log.add(diagnostic("destination ready"));
  log.accept(tracked);
  expect(log.get().map((entry) => entry.type)).toEqual([
    "Checkout Started",
    "destination ready",
  ]);
  expect(log.get().map((entry) => entry.id)).toEqual([3, 2]);
  expect(notifications).toBe(0);

  await Promise.resolve();
  expect(notifications).toBe(1);

  log.setLimit(5);
  await Promise.resolve();
  expect(notifications).toBe(1);

  log.setLimit(1);
  expect(log.get().map((entry) => entry.type)).toEqual(["Checkout Started"]);
  await Promise.resolve();
  expect(notifications).toBe(2);

  log.clear();
  expect(log.get()).toEqual([]);
  await Promise.resolve();
  expect(notifications).toBe(3);

  log.add(diagnostic("destination ready"));
  expect(log.get().map((entry) => entry.id)).toEqual([4]);
});

test("the limit is 200 until set, is clamped to 1 and 1000 and cut to a whole number, and falls back to 200 when it is not a number", () => {
  const fill = (limit: number | null, count: number) => {
    const log = new EventLog();

    if (limit !== null) {
      log.setLimit(limit);
    }

    for (let index = 0; index < count; index += 1) {
      log.add(diagnostic("event submitted"));
    }

    return log.get().length;
  };

  expect(fill(null, 250)).toBe(200);
  expect(fill(0, 3)).toBe(1);
  expect(fill(2.9, 3)).toBe(2);
  expect(fill(5_000, 1_001)).toBe(1_000);
  expect(fill(Number.NaN, 250)).toBe(200);
});

test("records a diagnostic with its description", () => {
  const log = new EventLog();

  log.add(
    diagnostic(
      "event dropped",
      {
        reason: "provider-filtered",
        losses: [{ path: "properties.plan", reason: "invalid" }],
      },
      "event",
    ),
  );

  expect(log.get()).toEqual([
    {
      row: "DIAGNOSTIC",
      id: 1,
      source: "event",
      type: "event dropped",
      destination: { name: "product" },
      event: { id: "e_1" },
      timestamp: 1_000,
      kind: "EVENT",
      summary: "provider-filtered · 1 loss",
      context: JSON.stringify(
        {
          reason: "provider-filtered",
          losses: [{ path: "properties.plan", reason: "invalid" }],
        },
        null,
        2,
      ),
      losses: [{ path: "properties.plan", reason: "invalid" }],
      destinations: [],
    },
  ]);
});

test("records an accepted event with its identity and its values", () => {
  const log = new EventLog();

  log.accept(tracked);

  expect(log.get()).toEqual([
    {
      row: "ACCEPTED",
      id: 1,
      source: "event",
      type: "Checkout Started",
      destination: null,
      event: { id: "e_1" },
      timestamp: 1_000,
      kind: "EVENT",
      summary: "#1 · ada",
      values: JSON.stringify(
        { properties: { plan: "pro" }, context: {}, traits: {}, groups: {} },
        null,
        2,
      ),
    },
  ]);
});

test("an observer removed by an earlier one during a notification is not called", async () => {
  const log = new EventLog();
  const calls: string[] = [];

  let stopSecond = () => {};

  log.subscribe(() => {
    calls.push("first");
    stopSecond();
  });
  stopSecond = log.subscribe(() => {
    calls.push("second");
  });

  log.add(diagnostic("destination ready"));
  await Promise.resolve();

  expect(calls).toEqual(["first"]);
});

test("the same function subscribed twice is two subscriptions", async () => {
  const log = new EventLog();
  const calls: string[] = [];

  const listener = () => {
    calls.push("called");
  };

  const stop = log.subscribe(listener);

  log.subscribe(listener);
  log.add(diagnostic("destination ready"));
  await Promise.resolve();
  expect(calls).toEqual(["called", "called"]);

  stop();
  log.add(diagnostic("destination ready"));
  await Promise.resolve();
  expect(calls).toEqual(["called", "called", "called"]);
});
