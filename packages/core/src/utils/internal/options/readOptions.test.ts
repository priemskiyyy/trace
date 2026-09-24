import { afterEach, expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { AnalyticsSession } from "src/types/AnalyticsSession";
import type { StandardSchema } from "src/types/StandardSchema";
import { event } from "src/utils/event";
import { readOptions } from "src/utils/internal/options/readOptions";
import { isSensitiveKey } from "src/utils/isSensitiveKey";

const product = createMockAdapter({ name: "amplitude" }).adapter;
const research = createMockAdapter({ name: "posthog" }).adapter;

const plan: StandardSchema<unknown, unknown> = {
  "~standard": { version: 1, vendor: "test", validate: (value) => ({ value }) },
};

afterEach(() => {
  vi.useRealTimers();
});

test("every option left out takes its default", () => {
  const read = readOptions({ events: {}, destinations: { product } });

  expect(read.buffer).toEqual({ capacity: 100, maxAge: 30_000 });
  expect(read.timeout).toBe(5_000);
  expect(read.policy).toEqual({
    redact: isSensitiveKey,
    limits: { depth: 6, breadth: 50, stringLength: 2_000, totalSize: 200_000 },
  });
  expect(read.to).toBeUndefined();
  expect([...read.context]).toEqual([]);
  expect(read.schema).toEqual({ traits: null, groups: null });
  expect(read.consent).toEqual(new Map());
  expect(read.destinations).toEqual([
    {
      name: "product",
      adapter: { name: "amplitude", open: expect.any(Function) },
      gated: false,
    },
  ]);
});

test("an option given as undefined keeps its default, however deeply it sits", () => {
  const read = readOptions({
    events: {},
    destinations: { product },
    schema: undefined,
    defaults: { to: undefined, context: undefined },
    consent: undefined,
    privacy: {
      redact: undefined,
      // @ts-expect-error A caller without exactOptionalPropertyTypes can pass undefined for a limit.
      limits: {
        depth: undefined,
        breadth: undefined,
        stringLength: undefined,
        totalSize: undefined,
      },
    },
    buffer: { capacity: undefined, maxAge: undefined },
    timeout: undefined,
    now: undefined,
  });

  expect(read.buffer).toEqual({ capacity: 100, maxAge: 30_000 });
  expect(read.timeout).toBe(5_000);
  expect(read.policy).toEqual({
    redact: isSensitiveKey,
    limits: { depth: 6, breadth: 50, stringLength: 2_000, totalSize: 200_000 },
  });
  expect(read.to).toBeUndefined();
  expect([...read.context]).toEqual([]);
  expect(typeof read.now()).toBe("number");
});

test("options that are given are kept", () => {
  const redact = (key: string) => key === "iban";
  const now = () => 42;

  const read = readOptions({
    events: {},
    destinations: { product },
    privacy: { redact, limits: { depth: 2, totalSize: 10 } },
    buffer: { capacity: 0, maxAge: 1 },
    timeout: 0,
    now,
  });

  expect(read.policy).toEqual({
    redact,
    limits: { depth: 2, breadth: 50, stringLength: 2_000, totalSize: 10 },
  });
  expect(read.buffer).toEqual({ capacity: 0, maxAge: 1 });
  expect(read.timeout).toBe(0);
  expect(read.now()).toBe(42);
});

test("the registry is read once into its own map, so later changes to the object reach nothing", () => {
  const appOpened = event();
  const events: Record<string, typeof appOpened> = { "App Opened": appOpened };

  const read = readOptions({ events, destinations: { product } });

  events["Wishlist Shared"] = event();

  expect([...read.events]).toEqual([["App Opened", appOpened]]);
});

test("each destination gets an adapter of its own, gated when consent names it, and consent is read once into its own lists", () => {
  const purposes = ["analytics"];
  const consent: Record<string, string[]> = { research: purposes };

  const read = readOptions({
    events: {},
    destinations: { product, research },
    consent,
  });

  purposes.push("advertising");
  consent.product = ["analytics"];

  expect(read.destinations).toEqual([
    {
      name: "product",
      adapter: { name: "amplitude", open: expect.any(Function) },
      gated: false,
    },
    {
      name: "research",
      adapter: { name: "posthog", open: expect.any(Function) },
      gated: true,
    },
  ]);
  expect(
    read.destinations.every(({ adapter }) => Object.isFrozen(adapter)),
  ).toBe(true);
  expect(read.consent).toEqual(new Map([["research", ["analytics"]]]));
});

test("a destination's list of purposes is read once, so the list that was checked is the list that is kept", () => {
  const purposes = ["analytics"];

  let reads = 0;

  Object.defineProperty(purposes, 0, {
    enumerable: true,
    get: () => {
      reads += 1;

      return reads === 1 ? "analytics" : 7;
    },
  });

  const read = readOptions({
    events: {},
    destinations: { product },
    consent: { product: purposes },
  });

  expect(read.consent).toEqual(new Map([["product", ["analytics"]]]));
  expect(reads).toBe(1);
});

test("a consent entry that is not an own list of purpose strings is refused by name", () => {
  const inherited = { product: ["analytics"] };

  Object.setPrototypeOf(inherited, null);

  for (const consent of [
    { product: "analytics" },
    { product: ["analytics", 7] },
    { product: null },
    { __proto__: inherited },
  ]) {
    expect(() =>
      readOptions({ events: {}, destinations: { product }, consent }),
    ).toThrow(
      expect.objectContaining({
        code: "INVALID_CONFIGURATION",
        message: "consent.product must be an own list of purpose strings.",
      }),
    );
  }
});

test("an adapter's name and open are read once, and its own adapter calls open on the application's adapter", () => {
  const reads: string[] = [];
  const receivers: unknown[] = [];

  const session: AnalyticsSession = {
    native: null,
    track: () => ({ status: "submitted", evidence: "sdk-call-returned" }),
  };

  const adapter = {
    get name() {
      reads.push("name");

      return "amplitude";
    },
    get open() {
      reads.push("open");

      return function open(this: unknown) {
        receivers.push(this);

        return session;
      };
    },
  };

  const [destination] = readOptions({
    events: {},
    destinations: { product: adapter },
  }).destinations;

  expect(destination?.adapter.open()).toBe(session);
  expect(destination?.adapter.open()).toBe(session);
  expect(destination?.adapter.name).toBe("amplitude");
  expect(reads).toEqual(["name", "open"]);
  expect(receivers).toEqual([adapter, adapter]);
});

test("the schema's validators are copied once, so later changes to its objects reach nothing", () => {
  const traits: Record<string, StandardSchema<unknown, unknown>> = { plan };
  const workspace: Record<string, StandardSchema<unknown, unknown>> = { plan };

  const read = readOptions({
    events: {},
    destinations: { product },
    schema: { traits, groups: { workspace } },
  });

  delete traits.plan;
  traits.seats = plan;
  workspace.size = plan;

  expect(read.schema).toEqual({
    traits: new Map([["plan", plan]]),
    groups: new Map([["workspace", new Map([["plan", plan]])]]),
  });
});

test("a schema part that is present and not an object of validators is refused by name", () => {
  const refusals: [unknown, string][] = [
    [{ traits: null }, "schema.traits must be an object of validators."],
    [{ traits: "plan" }, "schema.traits must be an object of validators."],
    [{ traits: 42 }, "schema.traits must be an object of validators."],
    [{ traits: true }, "schema.traits must be an object of validators."],
    [{ traits: ["plan"] }, "schema.traits must be an object of validators."],
    [
      { groups: null },
      "schema.groups must be an object of validators by group type.",
    ],
    [
      { groups: "workspace" },
      "schema.groups must be an object of validators by group type.",
    ],
    [
      { groups: { workspace: "plan" } },
      "schema.groups.workspace must be an object of validators.",
    ],
    [
      { groups: { workspace: null } },
      "schema.groups.workspace must be an object of validators.",
    ],
  ];

  for (const [schema, message] of refusals) {
    expect(() =>
      // @ts-expect-error A JavaScript caller can pass schema parts that are not objects.
      readOptions({ events: {}, destinations: { product }, schema }),
    ).toThrow(
      expect.objectContaining({
        name: "TraceError",
        code: "INVALID_CONFIGURATION",
        message,
      }),
    );
  }
});

test("a schema whose validators cannot be read is a configuration error that keeps its cause", () => {
  const failure = new Error("schema exploded");

  expect(() =>
    readOptions({
      events: {},
      destinations: { product },
      schema: {
        groups: {
          get workspace(): Record<string, StandardSchema<unknown, unknown>> {
            throw failure;
          },
        },
      },
    }),
  ).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message: "Trace's options could not be read.",
      cause: failure,
    }),
  );
});

test("a defaults.to list is copied, and a function is kept as given", () => {
  const list = ["product"];
  const select = () => ["product"];

  const copied = readOptions({
    events: {},
    destinations: { product, research },
    defaults: { to: list },
  });

  list.push("research");

  expect(copied.to).toEqual(["product"]);
  expect(
    readOptions({
      events: {},
      destinations: { product },
      defaults: { to: select },
    }).to,
  ).toBe(select);
});

test("defaults.context is sanitized once, here, and later changes to the object reach nothing", () => {
  const context = { app: { version: "2.4.0" }, token: "t_1", surface: null };

  const read = readOptions({
    events: {},
    destinations: { product },
    defaults: { context },
  });

  context.app.version = "9.9.9";

  expect([...read.context]).toEqual([
    ["app", { value: { version: "2.4.0" }, losses: [] }],
    [
      "token",
      {
        value: undefined,
        losses: [{ path: "context.token", reason: "redacted" }],
      },
    ],
  ]);
});

test("the clock falls back to the system clock when it throws, answers no finite number or is not a function", () => {
  vi.useFakeTimers({ now: 1_000 });

  const clocks: unknown[] = [
    () => {
      throw new Error("clock exploded");
    },
    () => Number.NaN,
    () => Number.POSITIVE_INFINITY,
    () => "1970",
    "Date.now",
  ];

  for (const now of clocks) {
    const read = readOptions({ events: {}, destinations: { product }, now });

    expect(read.now()).toBe(1_000);
  }
});

test("defaults.context that is not a plain object is refused", () => {
  for (const context of [new Map([["app", "2.4.0"]]), ["2.4.0"]]) {
    expect(() =>
      readOptions({
        events: {},
        destinations: { product },
        defaults: { context },
      }),
    ).toThrow(
      expect.objectContaining({
        code: "INVALID_CONFIGURATION",
        message: "defaults.context must be an object.",
      }),
    );
  }
});

test("options that cannot be read are a configuration error that keeps its cause", () => {
  const failure = new Error("unreadable events");

  const options = {
    get events(): never {
      throw failure;
    },
    destinations: { product },
  };

  expect(() => readOptions(options)).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message: "Trace's options could not be read.",
      cause: failure,
    }),
  );
  // @ts-expect-error A JavaScript caller can pass no options at all.
  expect(() => readOptions(undefined)).toThrow(
    expect.objectContaining({
      code: "INVALID_CONFIGURATION",
      message: "Trace's options could not be read.",
    }),
  );
});
