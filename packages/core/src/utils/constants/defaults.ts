/** How many events one destination holds before it is ready, and for how many milliseconds. */
export const DEFAULT_BUFFER: { capacity: number; maxAge: number } =
  Object.freeze({ capacity: 100, maxAge: 30_000 });

/** Milliseconds one provider call may take before its outcome is indeterminate. */
export const DEFAULT_TIMEOUT = 5_000;

/** Milliseconds `flush()` waits when its caller names no timeout. */
export const DEFAULT_FLUSH_TIMEOUT = 2_000;

/** The longest delay `setTimeout` keeps: past 2^31 - 1 milliseconds it fires at once. */
export const MAX_DURATION = 2_147_483_647;
