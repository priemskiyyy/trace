import { expect, test } from "vitest";

import { getEventParameters } from "src/utils/getEventParameters";

const getParameters = (count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`p${index}`, index]),
  );

test("the items the mapping built go first as they are and take one of the 25 slots", () => {
  const items = [{ item_id: "sku_1", price: 20, quantity: 1 }];

  expect(
    getEventParameters(
      { name: "purchase", parameters: getParameters(25), items },
      {},
    ),
  ).toEqual({
    parameters: { items, ...getParameters(24) },
    losses: [{ path: "parameters.p24", reason: "truncated" }],
  });
});

test("the items' losses come first, then the parameters', then the context's", () => {
  const item = { item_id: "sku_1", size: { eu: 42 } };

  expect(
    getEventParameters(
      {
        name: "purchase",
        parameters: { "bad name": 1, note: "from the mapping" },
        items: [item],
      },
      { note: "from the context" },
    ),
  ).toEqual({
    parameters: { items: [{ item_id: "sku_1" }], note: "from the mapping" },
    losses: [
      { path: "items.0.size", reason: "unsupported" },
      { path: "parameters.bad name", reason: "invalid" },
      { path: "context.note", reason: "omitted" },
    ],
  });
});

test("the context goes under the parameters, and a context key a parameter shadows is omitted", () => {
  expect(
    getEventParameters(
      { name: "begin_checkout", parameters: { currency: "USD", value: 4 } },
      { currency: "EUR", source: "newsletter" },
    ),
  ).toEqual({
    parameters: { currency: "USD", value: 4, source: "newsletter" },
    losses: [{ path: "context.currency", reason: "omitted" }],
  });
});

test("the names gtag.js treats as commands are ordinary parameters here, since React Native Firebase gives them no meaning", () => {
  const commands = {
    user_id: "u_1",
    user_properties: "plan",
    client_id: "c_1",
    send_to: "G-TRACE",
    groups: "default",
    event_callback: "done",
    event_timeout: 2000,
  };

  expect(
    getEventParameters({ name: "login", parameters: commands }, {}),
  ).toEqual({ parameters: commands, losses: [] });
});

test("a context key the mapping also names is omitted, even when the mapping's own value for it is not sent", () => {
  expect(
    getEventParameters(
      { name: "login", parameters: { extend_session: "yes" } },
      { extend_session: 1 },
    ),
  ).toEqual({
    parameters: {},
    losses: [
      { path: "parameters.extend_session", reason: "invalid" },
      { path: "context.extend_session", reason: "omitted" },
    ],
  });
  expect(
    getEventParameters(
      { name: "login", parameters: getParameters(26) },
      { p25: 25 },
    ),
  ).toEqual({
    parameters: getParameters(25),
    losses: [
      { path: "parameters.p25", reason: "truncated" },
      { path: "context.p25", reason: "omitted" },
    ],
  });
});

test("a parameter or a context key named items never replaces the items the mapping built", () => {
  const items = [{ item_id: "sku_1" }];

  expect(
    getEventParameters(
      { name: "purchase", parameters: { items: "sku_1" }, items },
      { items: 3 },
    ),
  ).toEqual({
    parameters: { items },
    losses: [
      { path: "parameters.items", reason: "omitted" },
      { path: "context.items", reason: "omitted" },
    ],
  });
});

test("a parameter or a context key named items is omitted even when the mapping built none, because both bridges read it as the ecommerce list", () => {
  expect(
    getEventParameters(
      { name: "login", parameters: { items: "sku_1" } },
      { items: 3 },
    ),
  ).toEqual({
    parameters: {},
    losses: [
      { path: "parameters.items", reason: "omitted" },
      { path: "context.items", reason: "omitted" },
    ],
  });
  expect(
    getEventParameters(
      { name: "login", parameters: {} },
      { items: [{ item_id: "sku_1" }] },
    ),
  ).toEqual({
    parameters: {},
    losses: [{ path: "context.items", reason: "omitted" }],
  });
});

test("a name outside GA4's parameter rules or with a reserved prefix is invalid", () => {
  expect(
    getEventParameters(
      {
        name: "login",
        parameters: {
          ["x".repeat(41)]: 1,
          ["𠀀".repeat(41)]: 1,
          "1key": 1,
          "bad name": 1,
          _private: 1,
          firebase_screen: "Home",
          google_custom: 1,
          ga_custom: 1,
          ["y".repeat(40)]: 1,
          ["𠀀".repeat(40)]: 1,
          подія: 1,
          Method: "email",
        },
      },
      { "bad key": 1 },
    ),
  ).toEqual({
    parameters: {
      ["y".repeat(40)]: 1,
      ["𠀀".repeat(40)]: 1,
      подія: 1,
      Method: "email",
    },
    losses: [
      { path: `parameters.${"x".repeat(41)}`, reason: "invalid" },
      { path: `parameters.${"𠀀".repeat(41)}`, reason: "invalid" },
      { path: "parameters.1key", reason: "invalid" },
      { path: "parameters.bad name", reason: "invalid" },
      { path: "parameters._private", reason: "invalid" },
      { path: "parameters.firebase_screen", reason: "invalid" },
      { path: "parameters.google_custom", reason: "invalid" },
      { path: "parameters.ga_custom", reason: "invalid" },
      { path: "context.bad key", reason: "invalid" },
    ],
  });
});

test("at most 25 parameters are sent, the mapping's before the context, and each one past the limit is truncated", () => {
  expect(
    getEventParameters(
      { name: "login", parameters: getParameters(24) },
      { source: "newsletter", medium: "email" },
    ),
  ).toEqual({
    parameters: { ...getParameters(24), source: "newsletter" },
    losses: [{ path: "context.medium", reason: "truncated" }],
  });
});

test("a key left out as omitted, invalid or unsupported leaves its slot to the next one", () => {
  expect(
    getEventParameters(
      { name: "login", parameters: { "bad name": 1, ...getParameters(24) } },
      {
        p0: "shadowed",
        app: { version: "2.4.0" },
        source: "newsletter",
        medium: "email",
      },
    ),
  ).toEqual({
    parameters: { ...getParameters(24), source: "newsletter" },
    losses: [
      { path: "parameters.bad name", reason: "invalid" },
      { path: "context.p0", reason: "omitted" },
      { path: "context.app", reason: "unsupported" },
      { path: "context.medium", reason: "truncated" },
    ],
  });
});

test("text past 100 characters is cut, counted in characters, and the page parameters have their own limits", () => {
  expect(
    getEventParameters(
      {
        name: "page_view",
        parameters: {
          note: "n".repeat(101),
          kept: "k".repeat(100),
          emoji: "🙂".repeat(101),
          page_title: "t".repeat(301),
          page_referrer: "r".repeat(421),
          page_location: "l".repeat(1001),
        },
      },
      { source: "s".repeat(101), page_title: "context title" },
    ),
  ).toEqual({
    parameters: {
      note: "n".repeat(100),
      kept: "k".repeat(100),
      emoji: "🙂".repeat(100),
      page_title: "t".repeat(300),
      page_referrer: "r".repeat(420),
      page_location: "l".repeat(1000),
      source: "s".repeat(100),
    },
    losses: [
      { path: "parameters.note", reason: "truncated" },
      { path: "parameters.emoji", reason: "truncated" },
      { path: "parameters.page_title", reason: "truncated" },
      { path: "parameters.page_referrer", reason: "truncated" },
      { path: "parameters.page_location", reason: "truncated" },
      { path: "context.source", reason: "truncated" },
      { path: "context.page_title", reason: "omitted" },
    ],
  });
});

test("a nested context value is unsupported, because GA4 parameters are flat", () => {
  expect(
    getEventParameters(
      { name: "login", parameters: {} },
      { app: { version: "2.4.0" }, experiments: ["a", "b"], build: 7 },
    ),
  ).toEqual({
    parameters: { build: 7 },
    losses: [
      { path: "context.app", reason: "unsupported" },
      { path: "context.experiments", reason: "unsupported" },
    ],
  });
});

test("a flat value that is not text is sent as it is", () => {
  expect(
    getEventParameters(
      {
        name: "exception",
        parameters: { value: 49.5, fatal: false, coupon: null },
      },
      { signed_in: true, attempt: 2 },
    ),
  ).toEqual({
    parameters: {
      value: 49.5,
      fatal: false,
      coupon: null,
      signed_in: true,
      attempt: 2,
    },
    losses: [],
  });
});

test("a parameter named after a prototype member is an ordinary own parameter with the ordinary limit", () => {
  const { parameters } = getEventParameters(
    { name: "login", parameters: { constructor: "x".repeat(101) } },
    {},
  );

  expect(parameters).toEqual({ constructor: "x".repeat(100) });
  expect(Object.hasOwn(parameters, "constructor")).toBe(true);
});

test("a value React Native Firebase turns into a whole number is coerced when it is not one already, in the parameters and the context, and sent as it is", () => {
  const changed = {
    quantity: 2.5,
    index: "3",
    level: true,
    score: null,
    number_of_nights: "two",
    number_of_passengers: 1.5,
    number_of_rooms: false,
    extend_session: 2 ** 63,
  };

  expect(
    getEventParameters({ name: "purchase", parameters: changed }, {}),
  ).toEqual({
    parameters: changed,
    losses: [
      { path: "parameters.quantity", reason: "coerced" },
      { path: "parameters.index", reason: "coerced" },
      { path: "parameters.level", reason: "coerced" },
      { path: "parameters.score", reason: "coerced" },
      { path: "parameters.number_of_nights", reason: "coerced" },
      { path: "parameters.number_of_passengers", reason: "coerced" },
      { path: "parameters.number_of_rooms", reason: "coerced" },
      { path: "parameters.extend_session", reason: "coerced" },
    ],
  });
  expect(
    getEventParameters({ name: "purchase", parameters: {} }, changed),
  ).toEqual({
    parameters: changed,
    losses: [
      { path: "context.quantity", reason: "coerced" },
      { path: "context.index", reason: "coerced" },
      { path: "context.level", reason: "coerced" },
      { path: "context.score", reason: "coerced" },
      { path: "context.number_of_nights", reason: "coerced" },
      { path: "context.number_of_passengers", reason: "coerced" },
      { path: "context.number_of_rooms", reason: "coerced" },
      { path: "context.extend_session", reason: "coerced" },
    ],
  });
});

test("a whole number under those names is sent without a loss, as is any value under a name React Native Firebase does not convert", () => {
  const whole = {
    quantity: 3,
    index: 0,
    level: -2,
    score: 2 ** 53,
    number_of_nights: 7,
    number_of_passengers: 1,
    number_of_rooms: 2,
    extend_session: 1,
  };

  expect(
    getEventParameters(
      { name: "purchase", parameters: whole },
      { number_of_items: 2.5, levels: "debug", scores: true },
    ),
  ).toEqual({
    parameters: {
      ...whole,
      number_of_items: 2.5,
      levels: "debug",
      scores: true,
    },
    losses: [],
  });
});

test("success is coerced unless it is already 1 or 0, since React Native Firebase turns it into one of them", () => {
  expect(
    getEventParameters({ name: "login", parameters: { success: 1 } }, {}),
  ).toEqual({ parameters: { success: 1 }, losses: [] });
  expect(
    getEventParameters({ name: "login", parameters: {} }, { success: 0 }),
  ).toEqual({ parameters: { success: 0 }, losses: [] });
  expect(
    [true, "yes", 2, 0.5, null].map(
      (success) =>
        getEventParameters({ name: "login", parameters: { success } }, {})
          .losses,
    ),
  ).toEqual([
    [{ path: "parameters.success", reason: "coerced" }],
    [{ path: "parameters.success", reason: "coerced" }],
    [{ path: "parameters.success", reason: "coerced" }],
    [{ path: "parameters.success", reason: "coerced" }],
    [{ path: "parameters.success", reason: "coerced" }],
  ]);
  expect(
    getEventParameters({ name: "login", parameters: {} }, { success: "yes" }),
  ).toEqual({
    parameters: { success: "yes" },
    losses: [{ path: "context.success", reason: "coerced" }],
  });
});

test("a coerced value is reported in its own place among the other losses", () => {
  const item = { item_id: "sku_1", quantity: 0.5, size: { eu: 42 } };

  expect(
    getEventParameters(
      {
        name: "purchase",
        parameters: { "bad name": 1, quantity: 1.5, note: "n".repeat(101) },
        items: [item],
      },
      { level: "debug", success: true, source: "s".repeat(101) },
    ),
  ).toEqual({
    parameters: {
      items: [{ item_id: "sku_1", quantity: 0.5 }],
      quantity: 1.5,
      note: "n".repeat(100),
      level: "debug",
      success: true,
      source: "s".repeat(100),
    },
    losses: [
      { path: "items.0.quantity", reason: "coerced" },
      { path: "items.0.size", reason: "unsupported" },
      { path: "parameters.bad name", reason: "invalid" },
      { path: "parameters.quantity", reason: "coerced" },
      { path: "parameters.note", reason: "truncated" },
      { path: "context.level", reason: "coerced" },
      { path: "context.success", reason: "coerced" },
      { path: "context.source", reason: "truncated" },
    ],
  });
});

test("a value under a converted name that is shadowed, past the 25 or nested keeps that loss alone, since it is never sent", () => {
  expect(
    getEventParameters(
      { name: "purchase", parameters: { level: 1.5, ...getParameters(23) } },
      { level: "debug", score: { value: 2 }, success: "yes", quantity: 0.5 },
    ),
  ).toEqual({
    parameters: { level: 1.5, ...getParameters(23), success: "yes" },
    losses: [
      { path: "parameters.level", reason: "coerced" },
      { path: "context.level", reason: "omitted" },
      { path: "context.score", reason: "unsupported" },
      { path: "context.success", reason: "coerced" },
      { path: "context.quantity", reason: "truncated" },
    ],
  });
});

test("text under a converted name is coerced and sent whole, never cut, because React Native Firebase turns it into a number first", () => {
  expect(
    getEventParameters(
      {
        name: "purchase",
        parameters: { level: "l".repeat(101), success: "y".repeat(101) },
      },
      {},
    ),
  ).toEqual({
    parameters: { level: "l".repeat(101), success: "y".repeat(101) },
    losses: [
      { path: "parameters.level", reason: "coerced" },
      { path: "parameters.success", reason: "coerced" },
    ],
  });
});

test("text or null under extend_session is left out as invalid and leaves its slot, because the iOS bridge throws on it and would fail the event", () => {
  expect(
    getEventParameters(
      {
        name: "login",
        parameters: { extend_session: "yes", ...getParameters(24) },
      },
      { source: "newsletter" },
    ),
  ).toEqual({
    parameters: { ...getParameters(24), source: "newsletter" },
    losses: [{ path: "parameters.extend_session", reason: "invalid" }],
  });
  expect(
    getEventParameters(
      { name: "login", parameters: getParameters(24) },
      { extend_session: null, source: "newsletter" },
    ),
  ).toEqual({
    parameters: { ...getParameters(24), source: "newsletter" },
    losses: [{ path: "context.extend_session", reason: "invalid" }],
  });
});

test("a boolean under extend_session is sent and coerced, since both bridges convert it without throwing, and one past the 25 is truncated whatever it holds", () => {
  expect(
    getEventParameters(
      { name: "login", parameters: { extend_session: true } },
      {},
    ),
  ).toEqual({
    parameters: { extend_session: true },
    losses: [{ path: "parameters.extend_session", reason: "coerced" }],
  });
  expect(
    getEventParameters(
      { name: "login", parameters: getParameters(25) },
      { extend_session: "yes" },
    ),
  ).toEqual({
    parameters: getParameters(25),
    losses: [{ path: "context.extend_session", reason: "truncated" }],
  });
});
