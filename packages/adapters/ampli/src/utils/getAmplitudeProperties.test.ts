import { expect, test } from "vitest";

import { createTrackedEvent } from "src/trackedEvent.fixture";
import { getAmplitudeProperties } from "src/utils/getAmplitudeProperties";

const nest = (layers: number, leaf: unknown): unknown =>
  layers === 0 ? leaf : { next: nest(layers - 1, leaf) };

test("context goes under the properties, and each context key a property shadows is an omitted loss and nothing more", () => {
  expect(
    getAmplitudeProperties(
      createTrackedEvent({
        properties: { value: 49.5, cartId: "cart_1" },
        context: { cartId: "x".repeat(1025), app: "web", value: 0 },
      }),
    ),
  ).toStrictEqual({
    properties: { app: "web", value: 49.5, cartId: "cart_1" },
    losses: [
      { path: "context.cartId", reason: "omitted" },
      { path: "context.value", reason: "omitted" },
    ],
  });
});

test("a string longer than 1024 characters is sent whole, because Amplitude cuts it, and reported truncated where it sits", () => {
  const long = "x".repeat(1025);
  const limit = "y".repeat(1024);

  expect(
    getAmplitudeProperties(
      createTrackedEvent({
        properties: {
          note: long,
          fits: limit,
          list: ["a", long],
          nested: { note: long },
        },
        context: { page: long },
      }),
    ),
  ).toStrictEqual({
    properties: {
      page: long,
      note: long,
      fits: limit,
      list: ["a", long],
      nested: { note: long },
    },
    losses: [
      { path: "properties.note", reason: "truncated" },
      { path: "properties.list.1", reason: "truncated" },
      { path: "properties.nested.note", reason: "truncated" },
      { path: "context.page", reason: "truncated" },
    ],
  });
});

test("an object nested deeper than Amplitude's 40 layers is left out and reported unsupported where it sits", () => {
  const { properties, losses } = getAmplitudeProperties(
    createTrackedEvent({
      properties: { fits: nest(39, "leaf"), deep: nest(40, "leaf") },
    }),
  );

  expect(properties).toStrictEqual({
    fits: nest(39, "leaf"),
    deep: nest(38, {}),
  });
  expect(losses).toStrictEqual([
    {
      path: `properties.deep${".next".repeat(39)}`,
      reason: "unsupported",
    },
  ]);
});

test("an array counts as a layer, and a value left out of it is named by its index", () => {
  const { properties, losses } = getAmplitudeProperties(
    createTrackedEvent({
      properties: { deep: nest(38, [{ kept: 1 }, "text"]) },
    }),
  );

  expect(properties).toStrictEqual({ deep: nest(38, ["text"]) });
  expect(losses).toStrictEqual([
    {
      path: `properties.deep${".next".repeat(38)}.0`,
      reason: "unsupported",
    },
  ]);
});

test("losses follow the event's shape: every property loss comes before the first context loss", () => {
  const long = "x".repeat(1025);

  const { losses } = getAmplitudeProperties(
    createTrackedEvent({
      properties: { note: long, deep: nest(40, "leaf"), cartId: "cart_1" },
      context: { page: long, cartId: "from-context" },
    }),
  );

  expect(losses).toStrictEqual([
    { path: "properties.note", reason: "truncated" },
    { path: `properties.deep${".next".repeat(39)}`, reason: "unsupported" },
    { path: "context.page", reason: "truncated" },
    { path: "context.cartId", reason: "omitted" },
  ]);
});
