import { expect, test, vi } from "vitest";

import type { TrackedEvent } from "src/types/TrackedEvent";
import { resolveRoute } from "src/utils/internal/routing/resolveRoute";

const configured = ["product", "research", "warehouse"];

const EVENT: TrackedEvent = Object.freeze({
  id: "event-1",
  name: "Checkout Started",
  properties: Object.freeze({}),
  context: Object.freeze({}),
  identity: Object.freeze({
    generation: 0,
    user: null,
    traits: Object.freeze({}),
    groups: Object.freeze({}),
  }),
  timestamp: 1,
});

test("without a route every configured destination is selected", () => {
  expect(resolveRoute({ configured, to: undefined, event: EVENT })).toEqual([
    "product",
    "research",
    "warehouse",
  ]);
});

test("a list selects the destinations it names once each, in configured order", () => {
  expect(
    resolveRoute({
      configured,
      to: ["warehouse", "product", "warehouse"],
      event: EVENT,
    }),
  ).toEqual(["product", "warehouse"]);
});

test("a name no destination has is ignored", () => {
  expect(
    resolveRoute({ configured, to: ["crm", "research", 7], event: EVENT }),
  ).toEqual(["research"]);
});

test("an empty list selects nothing", () => {
  expect(resolveRoute({ configured, to: [], event: EVENT })).toEqual([]);
});

test("a function is asked with the finished event, and its list is read like any other", () => {
  const to = vi.fn(() => ["research", "crm"]);

  expect(resolveRoute({ configured, to, event: EVENT })).toEqual(["research"]);
  expect(to.mock.calls).toEqual([[EVENT]]);
});

test("a function is not asked before the event exists, so every destination is a candidate", () => {
  const to = vi.fn(() => ["research"]);

  expect(resolveRoute({ configured, to, event: null })).toEqual([
    "product",
    "research",
    "warehouse",
  ]);
  expect(to).not.toHaveBeenCalled();
});

test("a function that throws routes nowhere instead of throwing", () => {
  const to = () => {
    throw new Error("routing exploded");
  };

  expect(resolveRoute({ configured, to, event: EVENT })).toBeNull();
});

test.each([
  ["nothing", undefined],
  ["a name", "product"],
  ["an object", { product: true }],
])("a function that answers %s routes nowhere", (_, answer: unknown) => {
  expect(
    resolveRoute({ configured, to: () => answer, event: EVENT }),
  ).toBeNull();
});

test.each([
  ["a name", "product"],
  ["null", null],
  ["an object", { to: ["product"] }],
])("a route given as %s routes nowhere", (_, to: unknown) => {
  expect(resolveRoute({ configured, to, event: EVENT })).toBeNull();
});

test("a list whose reads throw routes nowhere instead of throwing", () => {
  const { proxy, revoke } = Proxy.revocable<string[]>([], {});

  revoke();

  expect(resolveRoute({ configured, to: proxy, event: EVENT })).toBeNull();
});
