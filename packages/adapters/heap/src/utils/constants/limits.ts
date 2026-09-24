/** Heap documents event names of up to 255 characters, and heap.js drops a name over 1024 bytes without a word. */
export const MAX_EVENT_NAME_LENGTH = 255;

/** Heap keeps event property text of fewer than 1024 characters and cuts longer text. */
export const MAX_VALUE_LENGTH = 1023;

/** Heap documents property names of fewer than 512 characters. */
export const MAX_NAME_LENGTH = 511;

/** heap.js drops a property whose name takes more than 512 bytes. */
export const MAX_NAME_BYTES = 512;

/** Heap's addUserProperties reference takes user property values of 255 characters or fewer. */
export const MAX_USER_PROPERTY_LENGTH = 255;

/** Heap documents identities of fewer than 255 characters, and heap.js cuts one past 255, which could make two users one. */
export const MAX_IDENTITY_LENGTH = 254;

/** Heap stores an array value as its items joined by `||`, cut as text is. */
export const ARRAY_SEPARATOR = "||";
