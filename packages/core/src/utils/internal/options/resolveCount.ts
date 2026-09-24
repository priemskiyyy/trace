import { TraceError } from "src/utils/TraceError";

export const resolveCount = (
  name: string,
  value: unknown,
  fallback: number,
) => {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TraceError({
      code: "INVALID_CONFIGURATION",
      message: `${name} must be a whole number of 0 or more.`,
    });
  }

  return value;
};
