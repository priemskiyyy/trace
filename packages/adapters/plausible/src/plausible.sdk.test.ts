// @vitest-environment jsdom
import * as Plausible from "@plausible-analytics/tracker";
import type { PlausibleRequestPayload } from "@plausible-analytics/tracker";
import { event, Trace, TraceError } from "@priemskiyyy/trace";
import { afterEach, beforeAll, expect, onTestFinished, test, vi } from "vitest";

import { plausible } from "src/plausible";
import type { PlausibleLike } from "src/types/PlausibleLike";

const TIMESTAMP_LOSS = { path: "timestamp", reason: "unsupported" };

const DROPPED = {
  state: "settled",
  outcomes: {
    site: {
      status: "dropped",
      reason: "provider-filtered",
      losses: [{ path: "properties.value", reason: "coerced" }, TIMESTAMP_LOSS],
    },
  },
};

const payloads: PlausibleRequestPayload[] = [];

const state: { dropping: boolean; answer: () => Promise<{ status: number }> } =
  {
    dropping: false,
    answer: () => Promise.resolve({ status: 202 }),
  };

const requested: string[] = [];

const fetch = (url: string) => {
  requested.push(url);

  return state.answer();
};

const events = {
  "Checkout Started": event<{ cart_id: string; value: number }>(),
};

beforeAll(() => {
  // jsdom has no ResizeObserver, which the tracker's engagement tracking needs.
  vi.stubGlobal("ResizeObserver", function ResizeObserver() {
    return { observe: () => {} };
  });
  vi.stubGlobal("fetch", fetch);
  Plausible.init({
    domain: "example.com",
    endpoint: "https://plausible.example.test/api/event",
    autoCapturePageviews: false,
    captureOnLocalhost: true,
    logging: false,
    transformRequest: (payload) => {
      if (state.dropping) {
        return null;
      }

      payloads.push(payload);

      return payload;
    },
  });
});

afterEach(() => {
  payloads.length = 0;
  requested.length = 0;
  state.dropping = false;
  state.answer = () => Promise.resolve({ status: 202 });
  localStorage.removeItem("plausible_ignore");
  vi.useRealTimers();
});

const createTrace = (sdk: PlausibleLike, timeout = 5_000) => {
  const trace = new Trace({
    events,
    destinations: { site: plausible({ sdk }) },
    defaults: { context: { app_version: "2.4.0" } },
    timeout,
  });

  onTestFinished(trace.dispose);
  trace.start();

  return trace;
};

test("the real tracker sends the event with its props as text and the context under them, and its 202 is sdk-callback-completed", async () => {
  const trace = createTrace({ track: Plausible.track });

  await expect(
    trace.track("Checkout Started", { cart_id: "cart_1", value: 49.5 }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      site: {
        status: "submitted",
        evidence: "sdk-callback-completed",
        event: null,
        losses: [
          { path: "properties.value", reason: "coerced" },
          TIMESTAMP_LOSS,
        ],
      },
    },
  });
  expect(payloads).toStrictEqual([
    {
      n: "Checkout Started",
      v: 36,
      u: location.href,
      d: "example.com",
      r: null,
      p: { cart_id: "cart_1", value: "49.5", app_version: "2.4.0" },
    },
  ]);
  expect(requested).toStrictEqual(["https://plausible.example.test/api/event"]);
});

test("an answer outside 2xx from the real tracker fails the event with DELIVERY_FAILED", async () => {
  const trace = createTrace(Plausible);

  state.answer = () => Promise.resolve({ status: 500 });

  await expect(
    trace.track("Checkout Started", { cart_id: "cart_1", value: 1 }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      site: {
        status: "failed",
        error: new TraceError({
          code: "DELIVERY_FAILED",
          message: "Plausible answered the event with the status 500.",
        }),
      },
    },
  });
});

test("a network failure in the real tracker fails the event with its error", async () => {
  const trace = createTrace(Plausible);
  const error = new TypeError("Failed to fetch");

  state.answer = () => Promise.reject(error);

  await expect(
    trace.track("Checkout Started", { cart_id: "cart_1", value: 1 }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: { site: { status: "failed", error } },
  });
});

test("an event the plausible_ignore flag excludes is dropped as provider-filtered, and nothing is sent", async () => {
  const trace = createTrace(Plausible);

  localStorage.setItem("plausible_ignore", "true");

  await expect(
    trace.track("Checkout Started", { cart_id: "cart_1", value: 1 }).settled,
  ).resolves.toStrictEqual(DROPPED);
  expect(requested).toStrictEqual([]);
});

test("an event transformRequest drops is dropped as provider-filtered", async () => {
  const trace = createTrace(Plausible);

  state.dropping = true;

  await expect(
    trace.track("Checkout Started", { cart_id: "cart_1", value: 1 }).settled,
  ).resolves.toStrictEqual(DROPPED);
  expect(requested).toStrictEqual([]);
});

test("without fetch the real tracker never answers, and Trace's timeout leaves the event indeterminate", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", undefined);
  onTestFinished(() => {
    vi.stubGlobal("fetch", fetch);
  });

  const trace = createTrace(Plausible, 1_000);

  const receipt = trace.track("Checkout Started", {
    cart_id: "cart_1",
    value: 1,
  });

  await vi.advanceTimersByTimeAsync(1_000);

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: { site: { status: "indeterminate", reason: "timeout" } },
  });
  expect(payloads.map(({ n }) => n)).toStrictEqual(["Checkout Started"]);
});
