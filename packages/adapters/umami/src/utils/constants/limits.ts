/** Umami cuts an event name past 50 characters. */
export const MAX_NAME_LENGTH = 50;

/** Umami cuts a distinct id past 50 characters, so two users who share its first 50 would become one. */
export const MAX_DISTINCT_ID_LENGTH = 50;

/** Umami cuts event data text past 500 characters, and drops an array whose text is longer. */
export const MAX_TEXT_LENGTH = 500;

/** Umami keeps event data numbers to 4 decimal places. */
export const NUMBER_PRECISION = 4;

/** Umami keeps at most 50 properties in one object of event data, an array counting as one. */
export const MAX_OBJECT_PROPERTIES = 50;
