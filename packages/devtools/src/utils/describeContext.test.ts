import type {
  TraceDiagnosticEvent,
  TraceDiagnosticType,
} from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { describeContext } from "src/utils/describeContext";

const event = (
  type: TraceDiagnosticType,
  context: unknown,
  source: TraceDiagnosticEvent["source"] = "event",
): TraceDiagnosticEvent => ({
  source,
  type,
  destination: null,
  event: null,
  timestamp: 0,
  context,
});

const summary = (
  type: TraceDiagnosticType,
  context: unknown,
  source?: TraceDiagnosticEvent["source"],
) => describeContext(event(type, context, source)).summary;

test("summarises the fields Trace contexts carry", () => {
  expect(
    summary("event accepted", {
      name: "Checkout Started",
      destinations: ["product", "backend"],
      losses: [
        { path: "properties.card.cvc", reason: "redacted" },
        { path: "timestamp", reason: "invalid" },
      ],
    }),
  ).toBe("Checkout Started · product, backend · 2 losses");
  expect(
    summary("event accepted", {
      name: "App Opened",
      destinations: ["product"],
      losses: [{ path: "context.token", reason: "redacted" }],
    }),
  ).toBe("App Opened · product · 1 loss");
  expect(
    summary("event accepted", {
      name: "App Opened",
      destinations: [],
      losses: [],
    }),
  ).toBe("App Opened");
  expect(
    summary("event submitted", { evidence: "sdk-call-returned", losses: [] }),
  ).toBe("sdk-call-returned");
  expect(
    summary("event dropped", { name: "App Opened", reason: "not-routed" }),
  ).toBe("App Opened · not-routed");
  expect(
    summary("event dropped", {
      reason: "provider-filtered",
      losses: [{ path: "properties.plan", reason: "invalid" }],
    }),
  ).toBe("provider-filtered · 1 loss");
  expect(
    summary(
      "identity step failed",
      { step: "identify", reason: "timeout" },
      "identity",
    ),
  ).toBe("identify · timeout");
  expect(
    summary("identity step unsupported", { step: "group" }, "identity"),
  ).toBe("group");
  expect(
    summary("user changed", { generation: 2, user: { id: "ada" } }, "identity"),
  ).toBe("#2 · ada");
  expect(
    summary("user changed", { generation: 3, user: null }, "identity"),
  ).toBe("#3 · anonymous");
  expect(
    summary(
      "consent changed",
      {
        decisions: { analytics: "granted", advertising: "denied" },
        refused: [],
      },
      "consent",
    ),
  ).toBe("analytics granted, advertising denied");
  expect(
    summary(
      "consent changed",
      { decisions: { analytics: "granted" }, refused: ["marketing"] },
      "consent",
    ),
  ).toBe("analytics granted · refused marketing");
  expect(summary("traits refused", { path: "traits.plan" }, "identity")).toBe(
    "traits.plan",
  );
  expect(summary("buffer overflow", { capacity: 100 }, "destination")).toBe(
    "capacity 100",
  );
  expect(summary("flush started", { timeout: 2000 }, "runtime")).toBe(
    "2000 ms",
  );
  expect(summary("flush completed", { drained: true }, "runtime")).toBe(
    "drained",
  );
  expect(summary("flush completed", { drained: false }, "runtime")).toBe(
    "not drained",
  );
  expect(
    summary("destination collection failed", { enabled: true }, "destination"),
  ).toBe("enabled");
  expect(
    summary("destination collection failed", { enabled: false }, "destination"),
  ).toBe("disabled");
  expect(summary("trace started", null, "runtime")).toBe("");
  expect(summary("trace started", undefined, "runtime")).toBe("");
  expect(summary("listener failed", 42)).toBe("42");
});

test("a field of an unexpected shape is left out of the summary and the detail", () => {
  const described = describeContext(
    event("event accepted", {
      name: 7,
      destinations: ["product", 7],
      losses: [
        { path: "context.token", reason: "redacted" },
        { path: "context.screen" },
        { path: 7, reason: "invalid" },
        7,
      ],
      generation: "2",
      user: { id: 7 },
      decisions: { analytics: 1, advertising: "denied" },
      capacity: "100",
      drained: "yes",
    }),
  );

  expect(described.summary).toBe("product · 1 loss · advertising denied");
  expect(described.losses).toEqual([
    { path: "context.token", reason: "redacted" },
  ]);
  expect(described.destinations).toEqual(["product"]);
});

test("keeps the losses and the destinations a context lists for the event's detail", () => {
  const described = describeContext(
    event("event accepted", {
      name: "Checkout Started",
      destinations: ["product", "backend"],
      losses: [
        { path: "properties.card.cvc", reason: "redacted" },
        { path: "timestamp", reason: "invalid" },
      ],
    }),
  );

  expect(described.losses).toEqual([
    { path: "properties.card.cvc", reason: "redacted" },
    { path: "timestamp", reason: "invalid" },
  ]);
  expect(described.destinations).toEqual(["product", "backend"]);
  expect(describeContext(event("trace started", null, "runtime"))).toEqual({
    context: "null",
    summary: "",
    kind: "RUNTIME",
    losses: [],
    destinations: [],
  });
});

test("the expanded text is the copy as JSON, with secrets redacted and cut after 12000 characters", () => {
  expect(
    describeContext(
      event("event submitted", {
        evidence: "sdk-call-returned",
        authorization: "Bearer abc",
        nested: { apiToken: "abc" },
      }),
    ).context,
  ).toBe(
    JSON.stringify(
      {
        evidence: "sdk-call-returned",
        authorization: "[Redacted]",
        nested: { apiToken: "[Redacted]" },
      },
      null,
      2,
    ),
  );
  expect(describeContext(event("listener failed", undefined)).context).toBe(
    "undefined",
  );

  const large = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [
      `note${index}`,
      "a".repeat(2_000),
    ]),
  );

  expect(describeContext(event("event submitted", large)).context).toBe(
    `${JSON.stringify(large, null, 2).slice(0, 12_000)}\n… [Truncated]`,
  );
});

test("a context that cannot be inspected is said to be so, and the row is still recorded", () => {
  const hostile = new Proxy(
    {},
    {
      ownKeys: () => {
        throw new Error("no keys for you");
      },
    },
  );

  expect(describeContext(event("event submitted", hostile))).toEqual({
    context: "[Unable to inspect this value]",
    summary: "",
    kind: "EVENT",
    losses: [],
    destinations: [],
  });
});
