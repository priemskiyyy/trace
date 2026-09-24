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
      { name: "purchase", parameters: { "bad name": 1 }, items: [item] },
      { user_id: "u_1" },
    ),
  ).toEqual({
    parameters: { items: [{ item_id: "sku_1" }] },
    losses: [
      { path: "items.0.size", reason: "unsupported" },
      { path: "parameters.bad name", reason: "invalid" },
      { path: "context.user_id", reason: "omitted" },
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

test.each([
  "_extracted_data",
  "_fpm_parameters",
  "_google_ng",
  "_ip_override",
  "_is_fpm",
  "_is_passthrough_cid",
  "_lps",
  "_platinum_request_status",
  "_protected_audience_enabled",
  "_sst_parameters",
  "_user_agent_architecture",
  "_user_agent_bitness",
  "_user_agent_full_version_list",
  "_user_agent_mobile",
  "_user_agent_model",
  "_user_agent_platform",
  "_user_agent_platform_version",
  "_user_agent_wow64",
  "_user_region",
  "allow_ad_personalization_signals",
  "allow_display_features",
  "allow_enhanced_conversions",
  "allow_google_signals",
  "client_id",
  "consent_update_type",
  "conversion_api",
  "cookie_deprecation",
  "cookie_domain",
  "cookie_expires",
  "cookie_flags",
  "cookie_name",
  "cookie_path",
  "cookie_prefix",
  "cookie_update",
  "custom_map",
  "delivery_postal_code",
  "developer_id",
  "dynamic_event_settings",
  "engagement_time_msec",
  "enhanced_client_id",
  "event_callback",
  "event_developer_id_string",
  "event_id",
  "event_settings",
  "event_timeout",
  "ext_client_id",
  "firebase_id",
  "first_party_collection",
  "ga_restrict_domain",
  "gclgs",
  "gcllp",
  "gclst",
  "geo_granularity",
  "global_developer_id_string",
  "google_analysis_params",
  "google_signals",
  "google_tld",
  "groups",
  "gtag_event_feature_usage",
  "iframe_state",
  "ignore_referrer",
  "internal_traffic_results",
  "is_legacy_converted",
  "is_legacy_loaded",
  "items",
  "language",
  "linker",
  "non_interaction",
  "redact_device_info",
  "referral_exclusion_definition",
  "restricted_data_processing",
  "screen_resolution",
  "send_page_view",
  "send_to",
  "server_container_3p_enrichment",
  "server_container_url",
  "session_duration",
  "session_engaged",
  "session_engaged_time",
  "session_id",
  "session_number",
  "testonly",
  "tracking_id",
  "traffic_type",
  "transport_url",
  "update",
  "url_passthrough",
  "user_data",
  "user_data_mode",
  "user_data_settings",
  "user_id",
  "user_properties",
])(
  "%s in the parameters or the context is omitted, because gtag.js would read it as its own field and move, redirect or reconfigure the event",
  (key) => {
    expect(
      getEventParameters(
        { name: "login", parameters: { [key]: "from the mapping", value: 1 } },
        { [key]: "from the context" },
      ),
    ).toEqual({
      parameters: { value: 1 },
      losses: [
        { path: `parameters.${key}`, reason: "omitted" },
        { path: `context.${key}`, reason: "omitted" },
      ],
    });
  },
);

test.each([
  "add_payment_info",
  "add_shipping_info",
  "add_to_cart",
  "add_to_wishlist",
  "begin_checkout",
  "purchase",
  "refund",
  "remove_from_cart",
  "select_item",
  "select_promotion",
  "view_cart",
  "view_item",
  "view_item_list",
  "view_promotion",
])("%s, an ecommerce event, carries its items", (name) => {
  const items = [{ item_id: "sku_1" }];

  expect(getEventParameters({ name, parameters: {}, items }, {})).toEqual({
    parameters: { items },
    losses: [],
  });
});

test.each(["select_content", "login", "generate_lead", "my_event", "Purchase"])(
  "items on %s, outside GA4's ecommerce events, are left out as unsupported and take no slot, because gtag.js drops them silently",
  (name) => {
    expect(
      getEventParameters(
        { name, parameters: getParameters(25), items: [{ item_id: "sku_1" }] },
        {},
      ),
    ).toEqual({
      parameters: getParameters(25),
      losses: [{ path: "items", reason: "unsupported" }],
    });
  },
);

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
      {
        name: "login",
        parameters: { user_id: "u_1", "bad name": 1, ...getParameters(24) },
      },
      { app: { version: "2.4.0" }, source: "newsletter", medium: "email" },
    ),
  ).toEqual({
    parameters: { ...getParameters(24), source: "newsletter" },
    losses: [
      { path: "parameters.user_id", reason: "omitted" },
      { path: "parameters.bad name", reason: "invalid" },
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
