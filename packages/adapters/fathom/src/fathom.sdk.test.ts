// @vitest-environment jsdom
import { event, Trace } from "@priemskiyyy/trace";
import type { TrackedEvent } from "@priemskiyyy/trace";
import * as Fathom from "fathom-client";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import { fathom } from "src/fathom";

const events = {
  "Order Completed": event<{ order_id: string; total: number }>(),
};

const getOrderValue = ({ properties }: TrackedEvent) =>
  typeof properties.total === "number"
    ? Math.round(properties.total * 100)
    : null;

afterEach(() => {
  vi.unstubAllGlobals();
  document.getElementById("fathom-script")?.remove();
  window.__fathomClientQueue = [];
  window.__fathomIsLoading = false;
});

const createTrace = () => {
  const trace = new Trace({
    events,
    destinations: { site: fathom({ sdk: Fathom, value: getOrderValue }) },
  });

  onTestFinished(trace.dispose);
  trace.start();

  return trace;
};

// What Fathom's own script defines as window.fathom once it has loaded.
const stubScript = () => {
  const received: [name: string, options: unknown][] = [];

  vi.stubGlobal("fathom", {
    trackEvent: (name: string, options: unknown) => {
      received.push([name, options]);
    },
  });

  return received;
};

test("before Fathom's script loads, the real client queues each event with its value in cents, and the event is submitted", async () => {
  const trace = createTrace();

  await expect(
    trace.track("Order Completed", { order_id: "order_1", total: 49.5 })
      .settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      site: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [
          { path: "properties.order_id", reason: "unsupported" },
          { path: "properties.total", reason: "unsupported" },
          { path: "timestamp", reason: "unsupported" },
        ],
      },
    },
  });
  expect(window.__fathomClientQueue).toStrictEqual([
    {
      type: "trackEvent",
      eventName: "Order Completed",
      opts: { _value: 4950 },
    },
  ]);
});

test("once the script has loaded, the real client hands each event to it", async () => {
  const received = stubScript();
  const trace = createTrace();

  await trace.track("Order Completed", { order_id: "order_1", total: 12 })
    .settled;

  expect(received).toStrictEqual([["Order Completed", { _value: 1200 }]]);
  expect(window.__fathomClientQueue).toStrictEqual([]);
});

test("the queue the real client kept goes to the script when the application's load finishes", async () => {
  const trace = createTrace();

  Fathom.load("YOUR_SITE_ID", { auto: false });
  await trace.track("Order Completed", { order_id: "order_1", total: 3 })
    .settled;

  const received = stubScript();

  document.getElementById("fathom-script")?.dispatchEvent(new Event("load"));

  expect(received).toStrictEqual([["Order Completed", { _value: 300 }]]);
  expect(window.__fathomClientQueue).toStrictEqual([]);
});
