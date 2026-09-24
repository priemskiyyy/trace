import { expect, test } from "vitest";

import { getUmamiData } from "src/utils/getUmamiData";

const getEntries = (data: Record<string, unknown>, root = "properties") =>
  Object.entries(data).map(([key, value]) => ({
    key,
    value,
    path: `${root}.${key}`,
    isShadowed: false,
  }));

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

test("text, numbers, booleans and objects that Umami keeps as they are lose nothing", () => {
  expect(
    getUmamiData(
      getEntries({
        plan: "pro",
        seats: 3,
        price: 1.2345,
        big: 1e21,
        beta: true,
        cart: { id: "cart_1", lines: 2 },
      }),
    ),
  ).toStrictEqual({
    data: {
      plan: "pro",
      seats: 3,
      price: 1.2345,
      big: 1e21,
      beta: true,
      cart: { id: "cart_1", lines: 2 },
    },
    losses: [],
  });
});

test("text over 500 characters is sent whole and reported truncated at any depth, because Umami cuts it, and 500 is kept", () => {
  expect(
    getUmamiData(
      getEntries({
        note: "n".repeat(501),
        bio: "b".repeat(500),
        cart: { coupon: { code: "c".repeat(501) } },
      }),
    ).losses,
  ).toStrictEqual([
    { path: "properties.note", reason: "truncated" },
    { path: "properties.cart.coupon.code", reason: "truncated" },
  ]);
});

test("a number past four decimal places is truncated, because Umami keeps four", () => {
  expect(
    getUmamiData(getEntries({ ratio: 1.23456, sum: 0.1 + 0.2 })),
  ).toStrictEqual({
    data: { ratio: 1.23456, sum: 0.1 + 0.2 },
    losses: [
      { path: "properties.ratio", reason: "truncated" },
      { path: "properties.sum", reason: "truncated" },
    ],
  });
});

test("null and an array are coerced, because Umami stores them as their JSON text", () => {
  expect(
    getUmamiData(
      getEntries({ coupon: null, tags: ["gift"], cart: { lines: [1, 2] } }),
    ).losses,
  ).toStrictEqual([
    { path: "properties.coupon", reason: "coerced" },
    { path: "properties.tags", reason: "coerced" },
    { path: "properties.cart.lines", reason: "coerced" },
  ]);
});

test("an array whose JSON text passes 500 characters is invalid, because Umami drops it, and 500 is coerced", () => {
  expect(
    getUmamiData(
      getEntries({ long: ["a".repeat(497)], longest: ["a".repeat(496)] }),
    ).losses,
  ).toStrictEqual([
    { path: "properties.long", reason: "invalid" },
    { path: "properties.longest", reason: "coerced" },
  ]);
});

test("an object keeps its first 50 properties, an array counting as one, and every one past them is left out as truncated", () => {
  const properties = Object.fromEntries(
    range(49).map((index) => [`p${index}`, index]),
  );

  expect(
    getUmamiData(getEntries({ ...properties, tags: ["gift"], extra: 1 })),
  ).toStrictEqual({
    data: { ...properties, tags: ["gift"] },
    losses: [
      { path: "properties.tags", reason: "coerced" },
      { path: "properties.extra", reason: "truncated" },
    ],
  });
});

test("a nested object keeps its first 50 properties too", () => {
  const kept = Object.fromEntries(
    range(50).map((index) => [`n${index}`, index]),
  );

  expect(
    getUmamiData(getEntries({ cart: { ...kept, n50: 50 } })),
  ).toStrictEqual({
    data: { cart: kept },
    losses: [{ path: "properties.cart.n50", reason: "truncated" }],
  });
});

test("a shadowed entry is omitted, even past an object's 50th property, and never replaces the property", () => {
  const properties = Object.fromEntries(
    range(50).map((index) => [`p${index}`, index]),
  );

  expect(
    getUmamiData([
      ...getEntries(properties),
      { key: "p0", value: "context", path: "context.p0", isShadowed: true },
      { key: "locale", value: "de", path: "context.locale", isShadowed: false },
    ]),
  ).toStrictEqual({
    data: properties,
    losses: [
      { path: "context.p0", reason: "omitted" },
      { path: "context.locale", reason: "truncated" },
    ],
  });
});
