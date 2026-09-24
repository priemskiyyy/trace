import { expect, test } from "vitest";

import { createTrackedEvent, TRACKED_EVENT } from "src/trackedEvent.fixture";
import { getMixpanelProperties } from "src/utils/getMixpanelProperties";

const { id: EVENT_ID, timestamp: NOW } = TRACKED_EVENT;

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

test("properties and context become one set of properties with the event's time and its id as $insert_id, properties winning", () => {
  expect(
    getMixpanelProperties(
      createTrackedEvent({
        properties: { plan: "pro", value: 42 },
        context: { plan: "free", locale: "de" },
      }),
    ),
  ).toEqual({
    properties: {
      time: NOW,
      $insert_id: EVENT_ID,
      plan: "pro",
      value: 42,
      locale: "de",
    },
    losses: [{ path: "context.plan", reason: "omitted" }],
  });
});

test("names Mixpanel owns are omitted from properties and context, and names that only resemble them are carried", () => {
  expect(
    getMixpanelProperties(
      createTrackedEvent({
        properties: {
          time: 0,
          distinct_id: "grace",
          token: "other-project",
          ip: "203.0.113.7",
          alias: "grace",
          bucket: "b",
          $insert_id: "forged",
          $user_id: "grace",
          $set: { email: "grace@example.com" },
          mp_lib: "forged",
          time_zone: "UTC",
          ip_country: "DE",
          mpg: 30,
        },
        context: {
          $current_url: "https://example.com/forged",
          mp_country_code: "DE",
          locale: "de",
        },
      }),
    ),
  ).toEqual({
    properties: {
      time: NOW,
      $insert_id: EVENT_ID,
      time_zone: "UTC",
      ip_country: "DE",
      mpg: 30,
      locale: "de",
    },
    losses: [
      { path: "properties.time", reason: "omitted" },
      { path: "properties.distinct_id", reason: "omitted" },
      { path: "properties.token", reason: "omitted" },
      { path: "properties.ip", reason: "omitted" },
      { path: "properties.alias", reason: "omitted" },
      { path: "properties.bucket", reason: "omitted" },
      { path: "properties.$insert_id", reason: "omitted" },
      { path: "properties.$user_id", reason: "omitted" },
      { path: "properties.$set", reason: "omitted" },
      { path: "properties.mp_lib", reason: "omitted" },
      { path: "context.$current_url", reason: "omitted" },
      { path: "context.mp_country_code", reason: "omitted" },
    ],
  });
});

test("a property or context key named like one of the event's group types is omitted, since Mixpanel carries the membership under that name", () => {
  expect(
    getMixpanelProperties(
      createTrackedEvent({
        properties: { workspace: "Acme", plan: "pro" },
        context: { team: "Blue", locale: "de" },
        identity: {
          ...TRACKED_EVENT.identity,
          groups: {
            workspace: { id: "w_1", traits: {} },
            team: { id: "t_1", traits: {} },
          },
        },
      }),
    ),
  ).toEqual({
    properties: {
      time: NOW,
      $insert_id: EVENT_ID,
      plan: "pro",
      locale: "de",
    },
    losses: [
      { path: "properties.workspace", reason: "omitted" },
      { path: "context.team", reason: "omitted" },
    ],
  });
});

test("a name longer than 255 characters is a truncated loss, and so is an event name longer than 255, which mixpanel-browser cuts", () => {
  const long = "k".repeat(256);

  expect(
    getMixpanelProperties(
      createTrackedEvent({
        name: "N".repeat(256),
        properties: { [long]: 1, ["n".repeat(255)]: 2 },
        context: { [`c${long}`]: "x".repeat(256) },
      }),
    ),
  ).toEqual({
    properties: {
      time: NOW,
      $insert_id: EVENT_ID,
      [long]: 1,
      ["n".repeat(255)]: 2,
      [`c${long}`]: "x".repeat(256),
    },
    losses: [
      { path: "name", reason: "truncated" },
      { path: `properties.${long}`, reason: "truncated" },
      { path: `context.c${long}`, reason: "truncated" },
    ],
  });
  expect(
    getMixpanelProperties(createTrackedEvent({ name: "N".repeat(255) })).losses,
  ).toEqual([]);
});

test("an event keeps fewer than 255 properties with its time and id, so past them the context goes first, each key a truncated loss", () => {
  const properties = Object.fromEntries(
    range(250).map((index) => [`p${index}`, index]),
  );

  const context = Object.fromEntries(
    range(5).map((index) => [`c${index}`, index]),
  );

  const { properties: carried, losses } = getMixpanelProperties(
    createTrackedEvent({ properties, context }),
  );

  expect(carried).toEqual({
    time: NOW,
    $insert_id: EVENT_ID,
    ...properties,
    c0: 0,
    c1: 1,
  });
  expect(losses).toEqual([
    { path: "context.c2", reason: "truncated" },
    { path: "context.c3", reason: "truncated" },
    { path: "context.c4", reason: "truncated" },
  ]);
});

test("a list or object property whose JSON as Mixpanel sends it passes 8,000 bytes is left out as invalid", () => {
  const fits = range(31).map(() => "x".repeat(300));
  const overflows = range(32).map(() => "x".repeat(300));

  const tooLarge = Object.fromEntries(
    range(40).map((index) => [`k${index}`, "y".repeat(196)]),
  );

  expect(
    getMixpanelProperties(
      createTrackedEvent({
        properties: { fits, overflows },
        context: { tooLarge },
      }),
    ),
  ).toEqual({
    properties: { time: NOW, $insert_id: EVENT_ID, fits },
    losses: [
      ...range(31).map((index) => ({
        path: `properties.fits.${index}`,
        reason: "truncated",
      })),
      { path: "properties.overflows", reason: "invalid" },
      { path: "context.tooLarge", reason: "invalid" },
    ],
  });
});

test("a list property of exactly 8,000 bytes as sent is kept, and one byte more is left out", () => {
  const list = (last: number) => [
    ...range(30).map(() => "x".repeat(255)),
    "x".repeat(200),
    "x".repeat(last),
  ];

  expect(
    getMixpanelProperties(
      createTrackedEvent({
        properties: { atLimit: list(53), overLimit: list(54) },
      }),
    ),
  ).toEqual({
    properties: { time: NOW, $insert_id: EVENT_ID, atLimit: list(53) },
    losses: [{ path: "properties.overLimit", reason: "invalid" }],
  });
});

test("a nested limit reaches the losses under the property's own path", () => {
  expect(
    getMixpanelProperties(
      createTrackedEvent({
        properties: {
          cart: {
            id: "c_1",
            items: [{ sku: "sku_1", attributes: { color: "red" } }],
          },
        },
      }),
    ),
  ).toEqual({
    properties: {
      time: NOW,
      $insert_id: EVENT_ID,
      cart: { id: "c_1", items: [{ sku: "sku_1" }] },
    },
    losses: [
      { path: "properties.cart.items.0.attributes", reason: "unsupported" },
    ],
  });
});
