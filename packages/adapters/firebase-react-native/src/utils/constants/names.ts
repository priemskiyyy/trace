import type { Ga4Item } from "src/types/Ga4Item";

/** A GA4 event name as React Native Firebase checks it: an ASCII letter, then ASCII letters, digits and underscores, 40 in all, never starting with `query_id`, `firebase_`, `google_` or `ga_`. */
export const EVENT_NAME =
  /^(?!query_id|firebase_|google_|ga_)[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

/** A GA4 parameter name: a letter, then letters, digits and underscores, 40 in all, never starting with `firebase_`, `google_` or `ga_`. */
export const PARAMETER_NAME =
  /^(?!firebase_|google_|ga_)\p{L}[\p{L}\p{N}_]{0,39}$/u;

/** A GA4 user property name: the parameter rule within 24 characters. */
export const USER_PROPERTY_NAME =
  /^(?!firebase_|google_|ga_)\p{L}[\p{L}\p{N}_]{0,23}$/u;

/** Parameters both bridges read as their own: `items` is the ecommerce list on every event, so only the mapping's `items` may carry it. */
export const CONTROL_PARAMETERS = Object.freeze(["items"]);

/** Parameters React Native Firebase turns into whole numbers on their way to the native SDK, in the event and in each item. */
export const WHOLE_NUMBER_PARAMETERS = Object.freeze([
  "quantity",
  "index",
  "level",
  "score",
  "number_of_nights",
  "number_of_passengers",
  "number_of_rooms",
]);

/** Event parameters React Native Firebase turns into whole numbers: those, and `extend_session`, which it looks for on the event only. */
export const WHOLE_NUMBER_EVENT_PARAMETERS = Object.freeze([
  ...WHOLE_NUMBER_PARAMETERS,
  "extend_session",
]);

/** Event parameters the iOS bridge compares as numbers, so text or `null` there throws and fails the event. */
export const NUMBER_EVENT_PARAMETERS = Object.freeze(["extend_session"]);

/** Event parameters React Native Firebase turns into 1 or 0. */
export const FLAG_EVENT_PARAMETERS = Object.freeze(["success"]);

/** Event names React Native Firebase refuses to log, and the ones Google reserves for an app stream. */
export const RESERVED_EVENT_NAMES = Object.freeze([
  "ad_activeview",
  "ad_click",
  "ad_exposure",
  "ad_query",
  "ad_reward",
  "adunit_exposure",
  "app_background",
  "app_clear_data",
  "app_exception",
  "app_install",
  "app_remove",
  "app_store_refund",
  "app_store_subscription_cancel",
  "app_store_subscription_convert",
  "app_store_subscription_renew",
  "app_update",
  "app_upgrade",
  "dynamic_link_app_open",
  "dynamic_link_app_update",
  "dynamic_link_first_open",
  "error",
  "first_open",
  "first_visit",
  "in_app_purchase",
  "notification_dismiss",
  "notification_foreground",
  "notification_open",
  "notification_receive",
  "notification_send",
  "os_update",
  "session_start",
  "session_start_with_rollout",
  "user_engagement",
]);

/** User property names GA4 reserves. */
export const RESERVED_USER_PROPERTY_NAMES = Object.freeze([
  "cid",
  "customer_id",
  "customerid",
  "first_open_after_install",
  "first_open_time",
  "first_visit_time",
  "google_allow_ad_personalization_signals",
  "last_advertising_id_reset",
  "last_deep_link_referrer",
  "last_gclid",
  "lifetime_user_engagement",
  "non_personalized_ads",
  "session_id",
  "session_number",
  "sessionid",
  "sfmc_id",
  "sid",
  "uid",
  "user_id",
  "userid",
]);

/** The item parameters GA4 prescribes, the fields `Ga4Item` types; any other key of an item is a custom parameter. */
export const ITEM_PARAMETERS = Object.freeze({
  item_id: true,
  item_name: true,
  item_brand: true,
  item_category: true,
  item_category2: true,
  item_category3: true,
  item_category4: true,
  item_category5: true,
  item_variant: true,
  price: true,
  quantity: true,
  index: true,
  coupon: true,
  item_list_name: true,
  item_list_id: true,
  discount: true,
  affiliation: true,
  creative_name: true,
  creative_slot: true,
  promotion_id: true,
  promotion_name: true,
  location_id: true,
} satisfies Record<keyof Ga4Item, true>);
