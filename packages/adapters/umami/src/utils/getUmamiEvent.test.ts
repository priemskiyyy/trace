import { expect, test } from "vitest";

import { createTrackedEvent } from "src/trackedEvent.fixture";
import { getUmamiEvent } from "src/utils/getUmamiEvent";

const TIMESTAMP_LOSS = { path: "timestamp", reason: "unsupported" };

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

test("the data is the context with the properties over it, and a context key a property shadows is omitted", () => {
  expect(
    getUmamiEvent(
      createTrackedEvent({
        properties: { plan: "pro", value: 49.5 },
        context: { plan: "free", locale: "de" },
      }),
    ),
  ).toStrictEqual({
    name: "Checkout Started",
    data: { plan: "pro", value: 49.5, locale: "de" },
    id: "ada",
    losses: [{ path: "context.plan", reason: "omitted" }, TIMESTAMP_LOSS],
  });
});

test("the 50 properties Umami keeps are counted over the properties first, then the context", () => {
  const properties = Object.fromEntries(
    range(49).map((index) => [`p${index}`, index]),
  );

  expect(
    getUmamiEvent(
      createTrackedEvent({
        properties,
        context: { locale: "de", screen: "cart" },
      }),
    ),
  ).toStrictEqual({
    name: "Checkout Started",
    data: { ...properties, locale: "de" },
    id: "ada",
    losses: [{ path: "context.screen", reason: "truncated" }, TIMESTAMP_LOSS],
  });
  expect(
    getUmamiEvent(
      createTrackedEvent({
        properties: { ...properties, p49: 49 },
        context: { locale: "de" },
      }),
    ).losses,
  ).toStrictEqual([
    { path: "context.locale", reason: "truncated" },
    TIMESTAMP_LOSS,
  ]);
});

test("an anonymous event carries no id", () => {
  expect(
    getUmamiEvent(
      createTrackedEvent({
        identity: { generation: 0, user: null, traits: {}, groups: {} },
      }),
    ),
  ).toStrictEqual({
    name: "Checkout Started",
    data: {},
    id: undefined,
    losses: [TIMESTAMP_LOSS],
  });
});

test("a user id over 50 characters is left out as invalid, because Umami would cut it and could make two users one, and 50 is sent", () => {
  const getEvent = (id: string) =>
    createTrackedEvent({
      identity: { generation: 1, user: { id }, traits: {}, groups: {} },
    });

  expect(getUmamiEvent(getEvent("u".repeat(51)))).toStrictEqual({
    name: "Checkout Started",
    data: {},
    id: undefined,
    losses: [TIMESTAMP_LOSS, { path: "identity.user.id", reason: "invalid" }],
  });
  expect(getUmamiEvent(getEvent("u".repeat(50)))).toStrictEqual({
    name: "Checkout Started",
    data: {},
    id: "u".repeat(50),
    losses: [TIMESTAMP_LOSS],
  });
});

test("an event name over 50 characters is sent whole and reported truncated, because Umami cuts it, and 50 is kept", () => {
  expect(
    getUmamiEvent(createTrackedEvent({ name: "e".repeat(51) })),
  ).toStrictEqual({
    name: "e".repeat(51),
    data: {},
    id: "ada",
    losses: [{ path: "name", reason: "truncated" }, TIMESTAMP_LOSS],
  });
  expect(
    getUmamiEvent(createTrackedEvent({ name: "e".repeat(50) })).losses,
  ).toStrictEqual([TIMESTAMP_LOSS]);
});

test("losses come in order: the name, properties, context, the timestamp, then the user id", () => {
  expect(
    getUmamiEvent(
      createTrackedEvent({
        name: "e".repeat(51),
        properties: { ratio: 1.23456, plan: "pro" },
        context: { plan: "free", note: "n".repeat(501) },
        identity: {
          generation: 1,
          user: { id: "u".repeat(51) },
          traits: {},
          groups: {},
        },
      }),
    ).losses,
  ).toStrictEqual([
    { path: "name", reason: "truncated" },
    { path: "properties.ratio", reason: "truncated" },
    { path: "context.plan", reason: "omitted" },
    { path: "context.note", reason: "truncated" },
    TIMESTAMP_LOSS,
    { path: "identity.user.id", reason: "invalid" },
  ]);
});
