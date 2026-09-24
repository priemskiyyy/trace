import { expect, test } from "vitest";

import { createTrackedEvent, TRACKED_EVENT } from "src/trackedEvent.fixture";
import { getMixpanelProperties } from "src/utils/getMixpanelProperties";

const { id: EVENT_ID, timestamp: TIMESTAMP } = TRACKED_EVENT;
const VISITOR = "visitor-7";
const ANONYMOUS = { generation: 0, user: null, traits: {}, groups: {} };

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const withGroups = (groups: Record<string, string>) => ({
  generation: 1,
  user: { id: "ada" },
  traits: {},
  groups: Object.fromEntries(
    Object.entries(groups).map(([type, id]) => [type, { id, traits: {} }]),
  ),
});

test("properties and context become one set with the event's time, its id as $insert_id, its user as $user_id and the anonymous id as $device_id, properties winning", () => {
  expect(
    getMixpanelProperties(
      createTrackedEvent({
        properties: { plan: "pro", value: 42 },
        context: { plan: "free", locale: "de" },
      }),
      VISITOR,
    ),
  ).toStrictEqual({
    properties: {
      time: TIMESTAMP,
      $insert_id: EVENT_ID,
      $user_id: "ada",
      $device_id: VISITOR,
      plan: "pro",
      value: 42,
      locale: "de",
    },
    losses: [{ path: "context.plan", reason: "omitted" }],
  });
});

test("without an anonymous id there is no $device_id, and without a user no $user_id", () => {
  expect(
    getMixpanelProperties(createTrackedEvent(), undefined).properties,
  ).toStrictEqual({ time: TIMESTAMP, $insert_id: EVENT_ID, $user_id: "ada" });
  expect(
    getMixpanelProperties(createTrackedEvent({ identity: ANONYMOUS }), VISITOR)
      .properties,
  ).toStrictEqual({
    time: TIMESTAMP,
    $insert_id: EVENT_ID,
    $device_id: VISITOR,
  });
});

test("each group membership rides as a property named for its type that holds its id, and a property or context key named like a group type is omitted", () => {
  expect(
    getMixpanelProperties(
      createTrackedEvent({
        properties: { workspace: "Acme", plan: "pro" },
        context: { team: "Blue" },
        identity: withGroups({ workspace: "w_1", team: "t_1" }),
      }),
      undefined,
    ),
  ).toStrictEqual({
    properties: {
      time: TIMESTAMP,
      $insert_id: EVENT_ID,
      $user_id: "ada",
      plan: "pro",
      workspace: "w_1",
      team: "t_1",
    },
    losses: [
      { path: "properties.workspace", reason: "omitted" },
      { path: "context.team", reason: "omitted" },
    ],
  });
});

test("a group type that is a name Mixpanel owns is left out as omitted, so it cannot overwrite Mixpanel's own property", () => {
  expect(
    getMixpanelProperties(
      createTrackedEvent({
        identity: withGroups({ distinct_id: "w_1", $device_id: "w_2" }),
      }),
      VISITOR,
    ),
  ).toStrictEqual({
    properties: {
      time: TIMESTAMP,
      $insert_id: EVENT_ID,
      $user_id: "ada",
      $device_id: VISITOR,
    },
    losses: [
      { path: "identity.groups.distinct_id", reason: "omitted" },
      { path: "identity.groups.$device_id", reason: "omitted" },
    ],
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
          $device_id: "forged",
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
      undefined,
    ),
  ).toStrictEqual({
    properties: {
      time: TIMESTAMP,
      $insert_id: EVENT_ID,
      $user_id: "ada",
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
      { path: "properties.$device_id", reason: "omitted" },
      { path: "properties.mp_lib", reason: "omitted" },
      { path: "context.$current_url", reason: "omitted" },
      { path: "context.mp_country_code", reason: "omitted" },
    ],
  });
});

test("a name longer than 255 characters is a truncated loss, one per path even when its string is cut too, and the event name is sent as it is", () => {
  const long = "k".repeat(256);

  expect(
    getMixpanelProperties(
      createTrackedEvent({
        name: "N".repeat(300),
        properties: { [long]: 1, ["n".repeat(255)]: 2 },
        context: { [`c${long}`]: "x".repeat(256) },
      }),
      undefined,
    ),
  ).toStrictEqual({
    properties: {
      time: TIMESTAMP,
      $insert_id: EVENT_ID,
      $user_id: "ada",
      [long]: 1,
      ["n".repeat(255)]: 2,
      [`c${long}`]: "x".repeat(256),
    },
    losses: [
      { path: `properties.${long}`, reason: "truncated" },
      { path: `context.c${long}`, reason: "truncated" },
    ],
  });
});

test("an event keeps fewer than 255 properties, its own keys among them, so past them the memberships and then the context are left out, each a truncated loss", () => {
  const properties = Object.fromEntries(
    range(250).map((index) => [`p${index}`, index]),
  );

  const context = Object.fromEntries(
    range(3).map((index) => [`c${index}`, index]),
  );

  expect(
    getMixpanelProperties(
      createTrackedEvent({
        properties,
        context,
        identity: withGroups({ workspace: "w_1" }),
      }),
      undefined,
    ),
  ).toStrictEqual({
    properties: {
      time: TIMESTAMP,
      $insert_id: EVENT_ID,
      $user_id: "ada",
      ...properties,
      c0: 0,
    },
    losses: [
      { path: "context.c1", reason: "truncated" },
      { path: "context.c2", reason: "truncated" },
      { path: "identity.groups.workspace", reason: "truncated" },
    ],
  });
});

test("a list or object property whose JSON passes 8,000 bytes is left out as invalid", () => {
  const fits = range(26).map(() => "x".repeat(300));
  const overflows = range(27).map(() => "x".repeat(300));

  const tooLarge = Object.fromEntries(
    range(40).map((index) => [`k${index}`, "y".repeat(196)]),
  );

  expect(
    getMixpanelProperties(
      createTrackedEvent({
        properties: { fits, overflows },
        context: { tooLarge },
      }),
      undefined,
    ),
  ).toStrictEqual({
    properties: {
      time: TIMESTAMP,
      $insert_id: EVENT_ID,
      $user_id: "ada",
      fits,
    },
    losses: [
      ...range(26).map((index) => ({
        path: `properties.fits.${index}`,
        reason: "truncated",
      })),
      { path: "properties.overflows", reason: "invalid" },
      { path: "context.tooLarge", reason: "invalid" },
    ],
  });
});

test("a list property of exactly 8,000 bytes is kept, and one byte more is left out", () => {
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
      undefined,
    ),
  ).toStrictEqual({
    properties: {
      time: TIMESTAMP,
      $insert_id: EVENT_ID,
      $user_id: "ada",
      atLimit: list(53),
    },
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
      undefined,
    ),
  ).toStrictEqual({
    properties: {
      time: TIMESTAMP,
      $insert_id: EVENT_ID,
      $user_id: "ada",
      cart: { id: "c_1", items: [{ sku: "sku_1" }] },
    },
    losses: [
      { path: "properties.cart.items.0.attributes", reason: "unsupported" },
    ],
  });
});

test("a membership id over 255 characters is a truncated loss, after the properties' and the context's", () => {
  expect(
    getMixpanelProperties(
      createTrackedEvent({
        properties: { note: "x".repeat(256) },
        context: { note: "context" },
        identity: withGroups({ workspace: "w".repeat(256) }),
      }),
      undefined,
    ).losses,
  ).toStrictEqual([
    { path: "properties.note", reason: "truncated" },
    { path: "context.note", reason: "omitted" },
    { path: "identity.groups.workspace", reason: "truncated" },
  ]);
});

test("a group type named __proto__ stays a key of its own, holding the membership", () => {
  const { properties } = getMixpanelProperties(
    createTrackedEvent({ identity: withGroups({ ["__proto__"]: "w_1" }) }),
    undefined,
  );

  expect(properties).toStrictEqual(
    Object.fromEntries([
      ["time", TIMESTAMP],
      ["$insert_id", EVENT_ID],
      ["$user_id", "ada"],
      ["__proto__", "w_1"],
    ]),
  );
  expect(Object.getPrototypeOf(properties)).toBe(Object.prototype);
});
