/**
 * The event names Google recommends at support.google.com/analytics/answer/9267735,
 * `ad_impression` among them, which an app stream accepts; a mapping's `name` suggests them.
 *
 * @example
 * ```ts
 * const name: RecommendedEventName = "begin_checkout";
 * ```
 */
export type RecommendedEventName =
  | "ad_impression"
  | "earn_virtual_currency"
  | "join_group"
  | "login"
  | "search"
  | "select_content"
  | "share"
  | "sign_up"
  | "spend_virtual_currency"
  | "tutorial_begin"
  | "tutorial_complete"
  | "add_payment_info"
  | "add_shipping_info"
  | "add_to_cart"
  | "add_to_wishlist"
  | "begin_checkout"
  | "purchase"
  | "refund"
  | "remove_from_cart"
  | "select_item"
  | "select_promotion"
  | "view_cart"
  | "view_item"
  | "view_item_list"
  | "view_promotion"
  | "level_end"
  | "level_start"
  | "level_up"
  | "post_score"
  | "unlock_achievement"
  | "close_convert_lead"
  | "close_unconvert_lead"
  | "disqualify_lead"
  | "generate_lead"
  | "qualify_lead"
  | "working_lead";
