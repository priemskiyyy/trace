import type { TrackedEvent } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { getAmplitudeProperties } from "src/utils/getAmplitudeProperties";

const createEvent = (
  properties: Record<string, unknown>,
  context: Record<string, unknown>,
): TrackedEvent => ({
  id: "0b5f6c9e-8f1a-4c2d-9a3b-2f6e1d4c7a88",
  name: "Checkout Started",
  properties,
  context,
  identity: { generation: 1, user: { id: "ada" }, traits: {}, groups: {} },
  timestamp: 1_767_225_600_000,
});

const nest = (objects: number, leaf: unknown) =>
  Array.from({ length: objects }).reduce<unknown>(
    (inner) => ({ a: inner }),
    leaf,
  );

const kept = "a".repeat(1_024);
const long = "a".repeat(1_025);

test("the context goes under the properties, and a context key a property shadows is an omitted loss", () => {
  expect(
    getAmplitudeProperties(
      createEvent(
        { plan: "pro", seats: 12, trial: false, coupon: null },
        { plan: "free", locale: "de" },
      ),
    ),
  ).toStrictEqual({
    properties: {
      locale: "de",
      plan: "pro",
      seats: 12,
      trial: false,
      coupon: null,
    },
    losses: [{ path: "context.plan", reason: "omitted" }],
  });
});

test("a string over 1,024 characters, wherever it sits, is a truncated loss and goes whole, since Amplitude cuts it", () => {
  expect(
    getAmplitudeProperties(
      createEvent(
        { note: long, cart: { label: long, tags: ["b", long] }, exact: kept },
        { page: { title: long } },
      ),
    ),
  ).toStrictEqual({
    properties: {
      page: { title: long },
      note: long,
      cart: { label: long, tags: ["b", long] },
      exact: kept,
    },
    losses: [
      { path: "properties.note", reason: "truncated" },
      { path: "properties.cart.label", reason: "truncated" },
      { path: "properties.cart.tags.1", reason: "truncated" },
      { path: "context.page.title", reason: "truncated" },
    ],
  });
});

test("a value nested past Amplitude's 40 layers is left out of the properties or the context as an unsupported loss", () => {
  expect(
    getAmplitudeProperties(
      createEvent({ deep: nest(40, "leaf") }, { trail: nest(40, "leaf") }),
    ),
  ).toStrictEqual({
    properties: { deep: nest(38, {}), trail: nest(38, {}) },
    losses: [
      { path: `properties.deep${".a".repeat(39)}`, reason: "unsupported" },
      { path: `context.trail${".a".repeat(39)}`, reason: "unsupported" },
    ],
  });
});

test("a shadowed context key is left out whole, so it reports no loss of its own", () => {
  expect(
    getAmplitudeProperties(
      createEvent(
        { note: "short", deep: 1 },
        { note: long, deep: nest(40, "leaf") },
      ),
    ),
  ).toStrictEqual({
    properties: { note: "short", deep: 1 },
    losses: [
      { path: "context.note", reason: "omitted" },
      { path: "context.deep", reason: "omitted" },
    ],
  });
});

test("the properties' losses come before the context's, in the order of the event", () => {
  expect(
    getAmplitudeProperties(
      createEvent({ plan: "pro", note: long }, { plan: "free", page: long }),
    ).losses,
  ).toStrictEqual([
    { path: "properties.note", reason: "truncated" },
    { path: "context.plan", reason: "omitted" },
    { path: "context.page", reason: "truncated" },
  ]);
});
