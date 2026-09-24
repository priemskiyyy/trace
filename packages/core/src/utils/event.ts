import type { EventDefinition } from "src/types/EventDefinition";
import type { InferInput } from "src/types/InferInput";
import type { InferOutput } from "src/types/InferOutput";
import type { StandardSchema } from "src/types/StandardSchema";
import { isPlainObject } from "src/utils/common/isPlainObject";
import { getRefusal } from "src/utils/internal/schema/getRefusal";
import { validateWithSchema } from "src/utils/internal/schema/validateWithSchema";

/**
 * Declares one event of the registry: without arguments it takes no
 * properties, with a type argument its properties are only checked to be a
 * plain object, and with a Standard Schema they are validated synchronously
 * when it is tracked.
 *
 * @example
 * ```ts
 * export const events = {
 *   "App Opened": event(),
 *   "Search Performed": event<{ query: string }>(),
 *   "Checkout Started": event(z.object({ cart: z.object({ id: z.string() }) })),
 * };
 * ```
 */
// Overloaded function signatures, so the type comes from the schema or the type argument without a cast.
export function event(): EventDefinition<undefined, Record<string, never>>;
export function event<TProperties extends object>(): EventDefinition<
  TProperties,
  TProperties
>;
export function event<TSchema extends StandardSchema<object, object>>(
  schema: TSchema,
): EventDefinition<InferInput<TSchema>, InferOutput<TSchema>>;

export function event(
  schema?: StandardSchema<object, object>,
): EventDefinition<unknown, unknown> {
  if (schema === undefined) {
    return {
      parse: (input) => {
        if (input === undefined) {
          return { ok: true, properties: Object.freeze({}) };
        }

        if (isPlainObject(input)) {
          return { ok: true, properties: input };
        }

        return getRefusal("Expected an object of event properties.");
      },
    };
  }

  return {
    parse: (input) => {
      const result = validateWithSchema(schema, input);

      if (!result.ok || isPlainObject(result.properties)) {
        return result;
      }

      return getRefusal(
        "The schema's output is not a plain object of event properties.",
      );
    },
  };
}
