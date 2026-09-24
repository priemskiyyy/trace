import { MAX_DURATION } from "src/utils/constants/defaults";
import { TraceError } from "src/utils/TraceError";

export const resolveDuration = (
  name: string,
  value: unknown,
  fallback: number,
) => {
  if (value === undefined) {
    return fallback;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_DURATION
  ) {
    throw new TraceError({
      code: "INVALID_CONFIGURATION",
      message: `${name} must be a whole number of milliseconds from 0 to ${MAX_DURATION}.`,
    });
  }

  return value;
};
