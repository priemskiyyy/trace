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

/** Keys the mixpanel Node client moves out of a profile or group update into the request's own fields: `ip` places the profile, `$ignore_time` keeps its last-seen time. */
export const PROFILE_CONTROL_KEYS = Object.freeze(["ip", "$ignore_time"]);
