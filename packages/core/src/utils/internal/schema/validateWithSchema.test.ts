import { expect, test } from "vitest";

import type { StandardSchema } from "src/types/StandardSchema";
import { validateWithSchema } from "src/utils/internal/schema/validateWithSchema";

const schemaOf = <TOutput>(
  validate: StandardSchema<unknown, TOutput>["~standard"]["validate"],
): StandardSchema<unknown, TOutput> => ({
  "~standard": { version: 1, vendor: "test", validate },
});

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const currency = schemaOf<{ currency: "EUR" | "USD" }>((value) => {
  if (
    typeof value === "object" &&
    value !== null &&
    "currency" in value &&
    (value.currency === "EUR" || value.currency === "USD")
  ) {
    return { value: { currency: value.currency } };
  }

  return { issues: [{ message: "Expected EUR or USD." }] };
});

test("a valid value is accepted", () => {
  expect(validateWithSchema(currency, { currency: "EUR" })).toEqual({
    ok: true,
    properties: { currency: "EUR" },
  });
});

test("the validator's output replaces the input, so transforms and defaults apply", () => {
  const trimmed = schemaOf<{ query: string }>((value) => ({
    value: { query: String(value).trim() },
  }));

  expect(validateWithSchema(trimmed, "  shoes  ")).toEqual({
    ok: true,
    properties: { query: "shoes" },
  });
});

test("an invalid value is rejected with the validator's issues", () => {
  expect(validateWithSchema(currency, { currency: "GBP" })).toEqual({
    ok: false,
    issues: [{ path: "", message: "Expected EUR or USD." }],
  });
});

test("an issue's path is dotted, whether its segments are keys or objects that hold a key", () => {
  const nested = schemaOf<object>(() => ({
    issues: [
      { message: "Expected a string.", path: ["cart", { key: "id" }] },
      { message: "Expected a number.", path: ["items", 0, { key: "price" }] },
    ],
  }));

  expect(validateWithSchema(nested, {})).toEqual({
    ok: false,
    issues: [
      { path: "cart.id", message: "Expected a string." },
      { path: "items.0.price", message: "Expected a number." },
    ],
  });
});

test("a validator that returns a promise is a validation failure", () => {
  const asynchronous = schemaOf<object>(() =>
    Promise.resolve({ value: { late: true } }),
  );

  expect(validateWithSchema(asynchronous, {})).toEqual({
    ok: false,
    issues: [
      {
        path: "",
        message:
          "The schema validated asynchronously; event schemas must validate synchronously.",
      },
    ],
  });
});

test("a result that merely has a then property is not mistaken for a promise", () => {
  const thenish = schemaOf<string>(() => ({ then: "later", value: "c_1" }));

  expect(validateWithSchema(thenish, "anything")).toEqual({
    ok: true,
    properties: "c_1",
  });
});

test("a result that is not an object, or is neither issues, a value nor a promise, is refused as outside the contract", () => {
  const answers: unknown[] = [
    undefined,
    null,
    "valid",
    1,
    Object.assign(() => {}, { then: () => {} }),
    {},
    { then: "later" },
  ];

  for (const answer of answers) {
    // @ts-expect-error A schema written in JavaScript can answer anything.
    const schema = schemaOf<object>(() => answer);

    expect(validateWithSchema(schema, {})).toEqual({
      ok: false,
      issues: [
        { path: "", message: "The schema answered outside its contract." },
      ],
    });
  }
});

test("an asynchronous validator that rejects leaves no unhandled rejection", async () => {
  const unhandled: unknown[] = [];

  const handleUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };

  process.on("unhandledRejection", handleUnhandled);
  validateWithSchema(
    schemaOf<object>(() => Promise.reject(new Error("late failure"))),
    {},
  );
  await macrotask();
  process.off("unhandledRejection", handleUnhandled);

  expect(unhandled).toEqual([]);
});

test("a validator that throws is a rejection, not a crash", () => {
  const throwing = schemaOf<object>(() => {
    throw new Error("validator exploded");
  });

  expect(validateWithSchema(throwing, {})).toEqual({
    ok: false,
    issues: [{ path: "", message: "The schema threw while validating." }],
  });
});
