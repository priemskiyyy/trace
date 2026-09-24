import type { TrackedEvent } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { describeTrackedEvent } from "src/utils/describeTrackedEvent";

const SECRET = "sk_live_12345";

const tracked = (
  overrides: Partial<TrackedEvent<string, unknown>> = {},
): TrackedEvent<string, unknown> => ({
  id: "5f0c1c9e-6b1e-4a53-9d0e-2f6a1d0c7b11",
  name: "Checkout Started",
  properties: { plan: "pro", apiToken: SECRET },
  context: { screen: "checkout", authorization: `Bearer ${SECRET}` },
  identity: {
    generation: 2,
    user: { id: "ada" },
    traits: { seats: 3, password: SECRET },
    groups: { workspace: { id: "w_1", traits: { secret: SECRET } } },
  },
  timestamp: 1_000,
  ...overrides,
});

test("an accepted event is described by its name and identity, with a bounded, redacted copy of its values", () => {
  expect(describeTrackedEvent(tracked())).toEqual({
    row: "ACCEPTED",
    source: "event",
    type: "Checkout Started",
    destination: null,
    event: { id: "5f0c1c9e-6b1e-4a53-9d0e-2f6a1d0c7b11" },
    timestamp: 1_000,
    kind: "EVENT",
    summary: "#2 · ada",
    values: JSON.stringify(
      {
        properties: { plan: "pro", apiToken: "[Redacted]" },
        context: { screen: "checkout", authorization: "[Redacted]" },
        traits: { seats: 3, password: "[Redacted]" },
        groups: { workspace: { id: "w_1", traits: { secret: "[Redacted]" } } },
      },
      null,
      2,
    ),
  });
});

test("an anonymous event says so", () => {
  expect(
    describeTrackedEvent(
      tracked({
        identity: { generation: 0, user: null, traits: {}, groups: {} },
      }),
    ).summary,
  ).toBe("#0 · anonymous");
});

test("an event whose values cannot be inspected is still recorded, and says so", () => {
  const hostile = new Proxy(
    {},
    {
      ownKeys: () => {
        throw new Error("no keys for you");
      },
    },
  );

  expect(describeTrackedEvent(tracked({ properties: hostile })).values).toBe(
    "[Unable to inspect this value]",
  );
});
