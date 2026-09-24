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

/** Names mixpanel-browser drops from a profile update without a word, because it writes them itself. */
export const RESERVED_PROFILE_PROPERTIES = Object.freeze([
  "$distinct_id",
  "$token",
  "$device_id",
  "$user_id",
  "$had_persisted_distinct_id",
]);

/** Names mixpanel-browser drops from a group profile update without a word, because they address the group. */
export const RESERVED_GROUP_PROPERTIES = Object.freeze([
  "$group_key",
  "$group_id",
]);
