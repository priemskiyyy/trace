/** Amplitude cuts a property value past 1,024 characters. */
export const MAX_PROPERTY_LENGTH = 1_024;

/** Amplitude takes no object nested past 40 layers, `event_properties` and `user_properties` being the first. */
export const MAX_DEPTH = 40;

/** Amplitude's Identify drops a whole value that holds an object of more than 1,000 keys. */
export const MAX_IDENTIFY_KEYS = 1_000;
