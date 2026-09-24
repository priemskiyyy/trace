/** Property names Mixpanel reserves: the event time, its user, its project token, the geolocation address, the alias and `bucket`, which hides other events. */
export const OWNED_PROPERTIES = Object.freeze([
  "time",
  "distinct_id",
  "token",
  "ip",
  "alias",
  "bucket",
]);

/** Name prefixes Mixpanel reserves for its own properties, `$insert_id`, `$user_id` and `$device_id` among them. */
export const OWNED_PREFIXES = Object.freeze(["$", "mp_"]);

/** A name mixpanel-react-native refuses as blank, by the test of its own `StringHelper.isValid`: its `unset` throws on one. */
export const BLANK_NAME = /^\s*$/;
