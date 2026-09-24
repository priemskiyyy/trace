import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { z } from "zod";

import type { EventDefinition } from "src/types/EventDefinition";
import type { StandardSchema } from "src/types/StandardSchema";
import { event } from "src/utils/event";

const asyncSchema: StandardSchema<{ value: number }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: () => Promise.resolve({ value: { value: 1 } }),
  },
};

const throwingSchema: StandardSchema<{ value: number }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: () => {
      throw new Error("The validator failed.");
    },
  },
};

const notAnObject = {
  ok: false,
  issues: [{ path: "", message: "Expected an object of event properties." }],
};

test("an event declared without a schema takes no properties and parses to an empty frozen object", () => {
  const result = event().parse(undefined);

  expect(result).toEqual({ ok: true, properties: {} });
  expect(result.ok && Object.isFrozen(result.properties)).toBe(true);
});

test("event() and event<T>() are the same call at runtime, so neither refuses what the other accepts", () => {
  // @ts-expect-error An untyped caller passed properties to an event that declares none.
  expect(event().parse({ cart: "c_1" })).toEqual({
    ok: true,
    properties: { cart: "c_1" },
  });
  // @ts-expect-error An untyped caller left out the properties the event declares.
  expect(event<{ query: string }>().parse(undefined)).toEqual({
    ok: true,
    properties: {},
  });
});

test("an event typed without a schema accepts any plain object and refuses everything else", () => {
  const typed = event<{ query: string }>();

  const withoutPrototype = { __proto__: null, query: "shoes" };

  expect(typed.parse({ query: "shoes" })).toEqual({
    ok: true,
    properties: { query: "shoes" },
  });
  expect(typed.parse(withoutPrototype)).toEqual({
    ok: true,
    properties: { query: "shoes" },
  });
  // @ts-expect-error An untyped caller passed a string where the event declares an object.
  expect(typed.parse("shoes")).toEqual(notAnObject);
  // @ts-expect-error An untyped caller passed an array where the event declares an object.
  expect(typed.parse(["shoes"])).toEqual(notAnObject);
  // @ts-expect-error An untyped caller passed null where the event declares an object.
  expect(typed.parse(null)).toEqual(notAnObject);
});

test("a plain object from another realm, such as an iframe or a Node vm context, is accepted", () => {
  const foreign: unknown = runInNewContext("({ query: 'shoes' })");
  const typed: EventDefinition<unknown> = event<{ query: string }>();

  expect(typed.parse(foreign)).toEqual({
    ok: true,
    properties: { query: "shoes" },
  });
});

test("an event without a schema refuses an object that is not plain, such as a Map, a Date or a class instance", () => {
  class SearchPerformed {
    query = "shoes";
  }

  // @ts-expect-error An untyped caller passed a Map to an event that declares no properties.
  expect(event().parse(new Map([["query", "shoes"]]))).toEqual(notAnObject);
  // @ts-expect-error An untyped caller passed a Date where the event declares an object.
  expect(event<{ query: string }>().parse(new Date(0))).toEqual(notAnObject);
  expect(event<{ query: string }>().parse(new SearchPerformed())).toEqual(
    notAnObject,
  );
});

test("an object whose prototype cannot be read is refused instead of throwing", () => {
  const { proxy, revoke } = Proxy.revocable({ query: "shoes" }, {});

  revoke();

  expect(event<{ query: string }>().parse(proxy)).toEqual(notAnObject);
});

test("an event with a schema answers the schema's output, or its issues with dotted paths", () => {
  const checkout = event(
    z.object({ cart: z.object({ id: z.string() }), value: z.number() }),
  );

  expect(checkout.parse({ cart: { id: "c_1" }, value: 49 })).toEqual({
    ok: true,
    properties: { cart: { id: "c_1" }, value: 49 },
  });
  // @ts-expect-error An untyped caller passed a number where the schema declares a string.
  expect(checkout.parse({ cart: { id: 7 }, value: 49 })).toMatchObject({
    ok: false,
    issues: [{ path: "cart.id" }],
  });
});

test("a schema that validates asynchronously refuses the event, because tracking is synchronous", () => {
  expect(event(asyncSchema).parse({ value: 1 })).toEqual({
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

test("a schema that throws refuses the event instead of throwing", () => {
  expect(event(throwingSchema).parse({ value: 1 })).toEqual({
    ok: false,
    issues: [{ path: "", message: "The schema threw while validating." }],
  });
});

test("a schema whose output is not a plain object refuses the event, and the issue says so", () => {
  const notPlainOutput = {
    ok: false,
    issues: [
      {
        path: "",
        message:
          "The schema's output is not a plain object of event properties.",
      },
    ],
  };

  expect(event(z.array(z.string())).parse(["sale"])).toEqual(notPlainOutput);
  expect(event(z.date()).parse(new Date(0))).toEqual(notPlainOutput);
  expect(
    event(z.map(z.string(), z.string())).parse(new Map([["query", "shoes"]])),
  ).toEqual(notPlainOutput);
});
