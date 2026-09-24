/** GA4 keeps at most 25 parameters on one event. */
export const MAX_EVENT_PARAMETERS = 25;

/** GA4 keeps parameter text of at most 100 characters. */
export const MAX_VALUE_LENGTH = 100;

/** GA4 keeps longer text in these page parameters than in any other. */
export const PAGE_VALUE_LENGTHS = Object.freeze({
  page_title: 300,
  page_referrer: 420,
  page_location: 1000,
});

/** GA4 keeps at most 200 entries in an ecommerce event's `items`. */
export const MAX_ITEMS = 200;

/** GA4 keeps at most 27 custom parameters on one item, besides the prescribed ones. */
export const MAX_CUSTOM_ITEM_PARAMETERS = 27;

/** GA4 ignores a user property value longer than 36 characters. */
export const MAX_USER_PROPERTY_VALUE_LENGTH = 36;

/** GA4 keeps user ids of at most 256 characters. */
export const MAX_USER_ID_LENGTH = 256;
