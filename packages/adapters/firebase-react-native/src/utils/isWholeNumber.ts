import { WHOLE_NUMBER_LIMIT } from "src/utils/constants/limits";

export const isWholeNumber = (value: unknown) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= -WHOLE_NUMBER_LIMIT &&
  value < WHOLE_NUMBER_LIMIT;
