// @vitest-environment jsdom
import { event, Trace } from "@priemskiyyy/trace";
import { inject, track } from "@vercel/analytics";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import { vercel } from "src/vercel";

const SERVER_ERROR = new Error(
  "[Vercel Web Analytics] Please import `track` from `@vercel/analytics/server` when using this function in a server environment",
);

const events = {
  "Signup Completed": event<{ plan: string; seats: number }>(),
  "Cart Saved": event<{ cart: { id: string }; plan: string }>(),
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.vaq = [];
});

const createTrace = () => {
  const trace = new Trace({
    events,
    destinations: { site: vercel({ sdk: { track } }) },
    defaults: { context: { locale: "de" } },
  });

  onTestFinished(trace.dispose);
  trace.start();

  return trace;
};

test("the real SDK queues each event for Vercel's script with its first two properties", async () => {
  inject({ mode: "production" });

  const trace = createTrace();

  await expect(
    trace.track("Signup Completed", { plan: "pro", seats: 3 }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      site: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [
          { path: "context.locale", reason: "omitted" },
          { path: "timestamp", reason: "unsupported" },
        ],
      },
    },
  });
  expect(window.vaq).toStrictEqual([
    [
      "event",
      {
        name: "Signup Completed",
        data: { plan: "pro", seats: 3 },
        options: undefined,
      },
    ],
  ]);
});

test("in development the real SDK drops a whole event that carries an object, and the adapter's event, without it, still arrives", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});

  inject({ mode: "development" });
  track("Cart Saved", { plan: "pro", cart: null });

  // @ts-expect-error The SDK's type refuses the object that its development mode drops the event for.
  track("Cart Saved", { plan: "pro", cart: { id: "cart_1" } });

  await createTrace().track("Cart Saved", {
    cart: { id: "cart_1" },
    plan: "pro",
  }).settled;

  expect(window.vaq).toStrictEqual([
    [
      "event",
      {
        name: "Cart Saved",
        data: { plan: "pro", cart: null },
        options: undefined,
      },
    ],
    [
      "event",
      { name: "Cart Saved", data: { plan: "pro" }, options: undefined },
    ],
  ]);
  expect(logged.mock.calls).toStrictEqual([
    [
      new Error(
        "The following properties are not valid: cart. Only strings, numbers, booleans, and null are allowed.",
      ),
    ],
  ]);
});

test("outside a browser in development the real SDK throws, and Trace answers the event failed with that error", async () => {
  vi.stubGlobal("window", undefined);

  await expect(
    createTrace().track("Signup Completed", { plan: "pro", seats: 3 }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: { site: { status: "failed", error: SERVER_ERROR } },
  });
});

test("outside a browser in production the real SDK only warns, so the event is submitted though nothing is queued", async () => {
  const warned = vi.spyOn(console, "warn").mockImplementation(() => {});

  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal("window", undefined);

  await expect(
    createTrace().track("Signup Completed", { plan: "pro", seats: 3 }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      site: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [
          { path: "context.locale", reason: "omitted" },
          { path: "timestamp", reason: "unsupported" },
        ],
      },
    },
  });
  expect(warned.mock.calls).toStrictEqual([[SERVER_ERROR.message]]);
});
