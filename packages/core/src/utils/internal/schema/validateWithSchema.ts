import type { ParseResult } from "src/types/ParseResult";
import type { StandardSchema } from "src/types/StandardSchema";
import { getRefusal } from "src/utils/internal/schema/getRefusal";

const OUTSIDE_CONTRACT = "The schema answered outside its contract.";

export const validateWithSchema = <TOutput>(
  schema: StandardSchema<unknown, TOutput>,
  input: unknown,
): ParseResult<TOutput> => {
  try {
    const result = schema["~standard"].validate(input);

    // A schema written in JavaScript can answer anything.
    if (typeof result !== "object" || result === null) {
      return getRefusal(OUTSIDE_CONTRACT);
    }

    if ("issues" in result && result.issues !== undefined) {
      return {
        ok: false,
        issues: Array.from(result.issues, ({ message, path = [] }) => ({
          path: Array.from(path, (segment) =>
            String(typeof segment === "object" ? segment.key : segment),
          ).join("."),
          message,
        })),
      };
    }

    if ("value" in result) {
      return { ok: true, properties: result.value };
    }

    if (!("then" in result) || typeof result.then !== "function") {
      return getRefusal(OUTSIDE_CONTRACT);
    }

    // The one other answer the contract allows is a promise, observed so its rejection is handled.
    new Promise((resolve) => resolve(result)).catch(() => {});

    return getRefusal(
      "The schema validated asynchronously; event schemas must validate synchronously.",
    );
  } catch {
    return getRefusal("The schema threw while validating.");
  }
};
