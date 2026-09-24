import {
  DEFAULT_FLUSH_TIMEOUT,
  MAX_DURATION,
} from "src/utils/constants/defaults";

export const getFlushTimeout = (options: { timeout?: number } | undefined) => {
  try {
    const timeout: unknown = options?.timeout;

    if (typeof timeout !== "number") {
      return DEFAULT_FLUSH_TIMEOUT;
    }

    return Number.isNaN(timeout)
      ? 0
      : Math.min(Math.max(timeout, 0), MAX_DURATION);
  } catch {
    return DEFAULT_FLUSH_TIMEOUT;
  }
};
