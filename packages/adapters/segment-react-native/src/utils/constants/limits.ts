/** Segment's tracking API refuses an event larger than 32 KB, which Segment's own Node SDK counts as 32,768 bytes of JSON. */
export const MAX_EVENT_SIZE = 32 * 1024;
