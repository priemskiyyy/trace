import type { Answer } from "src/types/internal/Answer";

export const getAnswer = (value: unknown): Answer => {
  if (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  ) {
    // Promise.resolve reads a native promise's constructor; a resolve function reads only then.
    return {
      kind: "PENDING",
      promise: new Promise<unknown>((resolve) => resolve(value)),
    };
  }

  return { kind: "RESULT", value };
};
