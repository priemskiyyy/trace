/** Names RudderStack keeps for its own warehouse columns, compared in lowercase; its SDK only warns about a property that takes one. */
export const RESERVED_PROPERTIES = Object.freeze([
  "id",
  "anonymous_id",
  "user_id",
  "sent_at",
  "timestamp",
  "received_at",
  "original_timestamp",
  "event",
  "event_text",
  "channel",
  "context_ip",
  "context_request_ip",
  "context_passed_ip",
  "group_id",
  "previous_id",
]);
