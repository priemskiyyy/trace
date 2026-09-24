import { expect, test } from "vitest";

import { createTrackedEvent } from "src/trackedEvent.fixture";
import { getPlausibleProps } from "src/utils/getPlausibleProps";

const TIMESTAMP_LOSS = { path: "timestamp", reason: "unsupported" };

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

test("text is sent as it is, and a number or a boolean becomes text, a coerced loss", () => {
  expect(
    getPlausibleProps(
      createTrackedEvent({
        properties: { plan: "pro", value: 49.5, beta: true, seats: 0 },
      }),
    ),
  ).toStrictEqual({
    props: { plan: "pro", value: "49.5", beta: "true", seats: "0" },
    losses: [
      { path: "properties.value", reason: "coerced" },
      { path: "properties.beta", reason: "coerced" },
      { path: "properties.seats", reason: "coerced" },
      TIMESTAMP_LOSS,
    ],
  });
});

test("an object, an array or null is left out as unsupported, because Plausible takes scalar values only", () => {
  expect(
    getPlausibleProps(
      createTrackedEvent({
        properties: {
          cart: { id: "cart_1" },
          tags: ["gift"],
          coupon: null,
          plan: "pro",
        },
      }),
    ),
  ).toStrictEqual({
    props: { plan: "pro" },
    losses: [
      { path: "properties.cart", reason: "unsupported" },
      { path: "properties.tags", reason: "unsupported" },
      { path: "properties.coupon", reason: "unsupported" },
      TIMESTAMP_LOSS,
    ],
  });
});

test("the context goes under the properties, and a context key a property shadows is omitted", () => {
  expect(
    getPlausibleProps(
      createTrackedEvent({
        properties: { plan: "pro" },
        context: { plan: "free", locale: "de" },
      }),
    ),
  ).toStrictEqual({
    props: { plan: "pro", locale: "de" },
    losses: [{ path: "context.plan", reason: "omitted" }, TIMESTAMP_LOSS],
  });
});

test("at most 30 props are sent, the properties first, and every one past them is truncated; a value left out takes no place", () => {
  const properties = Object.fromEntries(
    range(29).map((index) => [`p${index}`, `v${index}`]),
  );

  const { props, losses } = getPlausibleProps(
    createTrackedEvent({
      properties: { ...properties, cart: { id: "cart_1" } },
      context: { locale: "de", screen: "cart", theme: "dark" },
    }),
  );

  expect(props).toStrictEqual({ ...properties, locale: "de" });
  expect(losses).toStrictEqual([
    { path: "properties.cart", reason: "unsupported" },
    { path: "context.screen", reason: "truncated" },
    { path: "context.theme", reason: "truncated" },
    TIMESTAMP_LOSS,
  ]);
});

test("a name over 300 characters is left out as invalid, and 300 is sent", () => {
  const long = "k".repeat(301);
  const longest = "k".repeat(300);

  expect(
    getPlausibleProps(
      createTrackedEvent({ properties: { [long]: "a", [longest]: "b" } }),
    ),
  ).toStrictEqual({
    props: { [longest]: "b" },
    losses: [{ path: `properties.${long}`, reason: "invalid" }, TIMESTAMP_LOSS],
  });
});

test("a value over 2000 characters is cut to 2000, a truncated loss, and 2000 is sent whole", () => {
  expect(
    getPlausibleProps(
      createTrackedEvent({
        properties: { note: "n".repeat(2001), bio: "b".repeat(2000) },
      }),
    ),
  ).toStrictEqual({
    props: { note: "n".repeat(2000), bio: "b".repeat(2000) },
    losses: [{ path: "properties.note", reason: "truncated" }, TIMESTAMP_LOSS],
  });
});

test("a cut never leaves half of a character that takes two UTF-16 code units", () => {
  expect(
    getPlausibleProps(
      createTrackedEvent({
        properties: { note: `${"n".repeat(1999)}😀tail` },
      }),
    ).props,
  ).toStrictEqual({ note: "n".repeat(1999) });
});

test("losses come in order: properties, then context, then the timestamp", () => {
  expect(
    getPlausibleProps(
      createTrackedEvent({
        properties: { value: 3, cart: { id: "cart_1" }, plan: "pro" },
        context: { plan: "free", app: { build: 7 }, beta: false },
      }),
    ).losses,
  ).toStrictEqual([
    { path: "properties.value", reason: "coerced" },
    { path: "properties.cart", reason: "unsupported" },
    { path: "context.plan", reason: "omitted" },
    { path: "context.app", reason: "unsupported" },
    { path: "context.beta", reason: "coerced" },
    TIMESTAMP_LOSS,
  ]);
});
