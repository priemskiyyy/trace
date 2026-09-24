/** Mixpanel's `/track` endpoint ingests events from the last five days only. */
export const MAX_EVENT_AGE = 5 * 24 * 60 * 60 * 1000;

/** Mixpanel keeps a property value to 255 characters. */
export const MAX_STRING_LENGTH = 255;

/** Mixpanel truncates a property name longer than 255 characters. */
export const MAX_NAME_LENGTH = 255;

/** A Mixpanel event has fewer than 255 properties. */
export const MAX_PROPERTIES = 254;

/** A nested object in a Mixpanel property has fewer than 255 keys. */
export const MAX_OBJECT_KEYS = 254;

/** Mixpanel nests objects in a property at most three levels deep. */
export const MAX_NESTING_DEPTH = 3;

/** A list in a Mixpanel property has fewer than 255 items. */
export const MAX_LIST_ITEMS = 254;

/** A list or object event property is at most 8 KB, read as 8,000 bytes of JSON so it fits either reading. */
export const MAX_PROPERTY_SIZE = 8_000;

/** A list or object profile property is at most 256 KB, read as 256,000 bytes of JSON so it fits either reading. */
export const MAX_PROFILE_PROPERTY_SIZE = 256_000;

/** A Mixpanel event is smaller than 1 MB of uncompressed JSON, read as 1,000,000 bytes so it fits either reading. */
export const MAX_EVENT_SIZE = 1_000_000;
