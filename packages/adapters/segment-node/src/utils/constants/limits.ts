/** Segment's tracking API refuses an event larger than 32 KB, which analytics-node sets at 32 × 1,024 bytes. */
export const MAX_EVENT_SIZE = 32 * 1024;
