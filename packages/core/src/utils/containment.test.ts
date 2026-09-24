import { afterEach, expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { AnalyticsSession } from "src/types/AnalyticsSession";
import type { EventDefinition } from "src/types/EventDefinition";
import type { StandardSchema } from "src/types/StandardSchema";
import { event } from "src/utils/event";
import { Trace } from "src/utils/Trace";

afterEach(() => {
  vi.useRealTimers();
});

const events = {
  "App Opened": event(),
  "Search Performed": event<{ query: string }>(),
};

const collectMicrotasks = () => {
  const tasks: Array<() => void> = [];

  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    tasks.push(task);
  });

  return tasks;
};

const failEverywhere = (
  fail: () => never | Promise<never>,
): AnalyticsAdapter => {
  let opens = 0;

  return {
    name: "failing",
    open: (): AnalyticsSession => {
      opens += 1;

      if (opens === 1) {
        throw new Error("open failed");
      }

      return {
        native: null,
        track: fail,
        identify: fail,
        traits: fail,
        group: fail,
        reset: fail,
        collection: fail,
        flush: fail,
        dispose: fail,
      };
    },
  };
};

test.each([
  [
    "throws",
    (): never => {
      throw new Error("the SDK threw");
    },
  ],
  ["rejects", () => Promise.reject(new Error("the SDK rejected"))],
])(
  "an adapter that %s from every method never reaches the host, and every receipt and flush still answers",
  async (_, fail) => {
    const steady = createMockAdapter();

    const trace = new Trace({
      events,
      destinations: { failing: failEverywhere(fail), steady: steady.adapter },
      consent: { failing: ["analytics"] },
    });

    expect(() => {
      trace.start();
      trace.start();
      trace.consent.set({ analytics: "granted" });
      trace.user({ id: "ada", traits: { plan: "pro" } });
      trace.group("workspace", { id: "w_1" });
    }).not.toThrow();

    const receipt = trace.track("App Opened");

    await expect(receipt.settled).resolves.toMatchObject({
      state: "settled",
      outcomes: {
        steady: { status: "submitted" },
      },
    });
    expect(receipt.status.get()).toMatchObject({
      outcomes: {
        failing: { status: "skipped", reason: "identity-failed" },
      },
    });
    await expect(trace.flush()).resolves.toMatchObject({
      destinations: { steady: { status: "flushed" } },
    });
    expect(() => trace.dispose()).not.toThrow();
    expect(steady.sessions[0]?.events).toHaveLength(1);
  },
);

test("an adapter whose open answers no session fails its start, and the others still open", () => {
  const steady = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: {
      // @ts-expect-error A JavaScript adapter's open can answer nothing.
      broken: { name: "broken", open: () => undefined },
      steady: steady.adapter,
    },
  });

  expect(() => trace.start()).not.toThrow();
  expect(trace.destination("broken").status.get()).toMatchObject({
    state: "failed",
    error: expect.objectContaining({ code: "INVALID_ANSWER" }),
  });
  expect(trace.destination("steady").status.get()).toEqual({ state: "ready" });
});

test.each([
  [
    "throws",
    () => {
      throw new Error("clock exploded");
    },
  ],
  ["answers NaN", () => Number.NaN],
  ["answers infinity", () => Number.POSITIVE_INFINITY],
])(
  "a clock that %s gives way to the system clock and never reaches the host",
  (_, now) => {
    vi.useFakeTimers({ now: 5_000 });

    const mock = createMockAdapter();
    const timestamps: number[] = [];

    const trace = new Trace({
      events,
      destinations: { product: mock.adapter },
      now,
    });

    trace.diagnostics.events.subscribe(({ timestamp }) =>
      timestamps.push(timestamp),
    );
    trace.start();

    expect(() => trace.track("App Opened")).not.toThrow();
    expect(mock.sessions[0]?.events[0]?.timestamp).toBe(5_000);
    expect(new Set(timestamps)).toEqual(new Set([5_000]));
  },
);

test("a schema that throws drops the event as invalid and never reaches the host", () => {
  const exploding: StandardSchema<{ query: string }> = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: () => {
        throw new Error("schema exploded");
      },
    },
  };

  const definition: EventDefinition<unknown, unknown> = {
    parse: () => {
      throw new Error("generated class exploded");
    },
  };

  const trace = new Trace({
    events: {
      "Search Performed": event(exploding),
      "Order Placed": definition,
    },
    destinations: { product: createMockAdapter().adapter },
  });

  trace.start();

  expect(
    trace.track("Search Performed", { query: "shoes" }).status.get(),
  ).toMatchObject({ state: "dropped", reason: "invalid" });
  expect(trace.track("Order Placed", {}).status.get()).toEqual({
    state: "dropped",
    reason: "invalid",
    issues: [
      { path: "", message: "The event definition threw while parsing." },
    ],
  });
});

test("listeners that throw never reach the host synchronously, whichever observable they listen to", () => {
  const tasks = collectMicrotasks();
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    consent: { product: ["analytics"] },
  });

  const explode = () => {
    throw new Error("listener exploded");
  };

  trace.status.subscribe(explode);
  trace.consent.subscribe(explode);
  trace.events.subscribe(explode);
  trace.diagnostics.events.subscribe(explode);
  trace.destination("product").status.subscribe(explode);

  expect(() => {
    trace.start();
    trace.consent.set({ analytics: "granted" });
    trace.track("App Opened").status.subscribe(explode);
    trace.dispose();
  }).not.toThrow();

  expect(tasks).toHaveLength(14);
  expect(mock.sessions[0]?.events).toHaveLength(1);

  for (const task of tasks) {
    expect(task).toThrow("listener exploded");
  }
});

test("track options whose reads throw, or which are not an object, never reach the host", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const { proxy, revoke } = Proxy.revocable({}, {});

  revoke();
  trace.start();

  const hostile = {
    get context(): never {
      throw new Error("unreadable context");
    },
  };

  for (const options of [hostile, "product", 42, proxy]) {
    expect(() => trace.track("App Opened", undefined, options)).not.toThrow();
  }

  expect(
    trace.track("App Opened", undefined, { context: proxy }).status.get(),
  ).toMatchObject({ state: "settled" });
});

test("a scope given garbage never reaches the host: options that cannot be read drop its events as sanitizer-failed", () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });
  const { proxy, revoke } = Proxy.revocable({}, {});

  revoke();
  trace.start();

  const outcomes = [undefined, null, proxy, "billing", { context: 42 }].map(
    (options) =>
      // @ts-expect-error A JavaScript caller can pass anything as the scope's options.
      trace.scope(options).track("App Opened").status.get(),
  );

  expect(outcomes).toEqual([
    { state: "dropped", reason: "sanitizer-failed" },
    { state: "dropped", reason: "sanitizer-failed" },
    { state: "dropped", reason: "sanitizer-failed" },
    {
      state: "settled",
      outcomes: {
        product: {
          status: "submitted",
          evidence: "sdk-call-returned",
          event: null,
          losses: [],
        },
      },
    },
    {
      state: "settled",
      outcomes: {
        product: {
          status: "submitted",
          evidence: "sdk-call-returned",
          event: null,
          losses: [{ path: "context", reason: "invalid" }],
        },
      },
    },
  ]);
});

test("a name that cannot become a string never reaches the host", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const hostile = {
    [Symbol.toPrimitive]: () => {
      throw new Error("a name was converted");
    },
  };

  trace.start();

  for (const name of [{ __proto__: null }, hostile]) {
    // @ts-expect-error A JavaScript caller can pass a name that is not a string.
    expect(() => trace.track(name)).not.toThrow();
    // @ts-expect-error A JavaScript caller can pass a name that is not a string.
    expect(() => trace.destination(name)).toThrow(
      expect.objectContaining({
        name: "TraceError",
        code: "INVALID_CONFIGURATION",
        message:
          'Trace has no destination for a name that is not a string. The configured destinations are "product".',
      }),
    );
  }
});

test("a schema whose validators cannot be read is refused at construction, so no identity call reads it later", () => {
  const failure = new Error("schema exploded");

  expect(
    () =>
      new Trace({
        events,
        destinations: { product: createMockAdapter().adapter },
        schema: {
          groups: {
            get workspace(): Record<string, StandardSchema<unknown>> {
              throw failure;
            },
          },
        },
      }),
  ).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      cause: failure,
    }),
  );
});

test("the schema is read once at construction, so a schema changed afterwards changes nothing", () => {
  const mock = createMockAdapter();

  const accepting: StandardSchema<unknown> = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => ({ value }),
    },
  };

  const traits: Record<string, StandardSchema<unknown>> = { plan: accepting };

  const workspace: Record<string, StandardSchema<unknown>> = {
    plan: accepting,
  };

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    schema: { traits, groups: { workspace } },
  });

  delete traits.plan;
  delete workspace.plan;
  traits.role = accepting;
  trace.start();
  trace.traits({ plan: "pro", role: "admin" });
  trace.group("workspace", { id: "w_1", traits: { plan: "team" } });
  trace.track("App Opened");

  expect(mock.sessions[0]?.events[0]?.identity).toEqual({
    generation: 0,
    user: null,
    traits: { plan: "pro" },
    groups: { workspace: { id: "w_1", traits: { plan: "team" } } },
  });
});
