import { expect, test } from "vitest";

import {
  EventNoProperties,
  EventWithAllProperties,
  EventWithConstTypes,
  EventWithDifferentCasingTypes,
  EventWithOptionalProperties,
} from "src/ampli-v2-generated";
import type { EventWithAllPropertiesProperties } from "src/ampli-v2-generated";
import { fromAmpli } from "src/fromAmpli";

const events = fromAmpli({
  "Event No Properties": EventNoProperties,
  "Event With All Properties": EventWithAllProperties,
  "Event With Const Types": EventWithConstTypes,
  "Event With Optional Properties": EventWithOptionalProperties,
  "event withDifferent_CasingTypes": EventWithDifferentCasingTypes,
});

const ALL_PROPERTIES = {
  requiredArray: ["one"],
  requiredBoolean: true,
  requiredEnum: "Enum1",
  requiredInteger: 5,
  requiredNumber: 2.2,
  requiredString: "value",
} satisfies EventWithAllPropertiesProperties;

test("the registry declares each generated class as an event under its canonical event_type", () => {
  expect(
    Object.entries(events).map(([name, { parse }]) => [name, typeof parse]),
  ).toEqual([
    ["Event No Properties", "function"],
    ["Event With All Properties", "function"],
    ["Event With Const Types", "function"],
    ["Event With Optional Properties", "function"],
    ["event withDifferent_CasingTypes", "function"],
  ]);
});

test("a key that is not its class's event_type throws INVALID_CONFIGURATION naming both", () => {
  expect(() =>
    fromAmpli({
      "Event No Properties": EventNoProperties,
      "Checkout Started": EventWithAllProperties,
    }),
  ).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message:
        'fromAmpli was given the key "Checkout Started" for a class whose event_type is "Event With All Properties". Key each class by its event_type.',
    }),
  );
});

test("the canonical name is read by constructing each class once without arguments, and every parse constructs it again", () => {
  const constructions: unknown[][] = [];

  class Counted {
    event_type = "Counted";
    event_properties: { note?: string } | undefined;

    constructor(...args: [{ note?: string }?]) {
      constructions.push(args);
      this.event_properties = args[0];
    }
  }

  const counted = fromAmpli({ Counted });

  expect(constructions).toEqual([[]]);

  counted.Counted.parse({ note: "first" });
  counted.Counted.parse(undefined);

  expect(constructions).toEqual([[], [{ note: "first" }], [undefined]]);
});

test("parse constructs the class, so the constants a generated constructor injects are sent", () => {
  expect(events["Event With Const Types"].parse(undefined)).toEqual({
    ok: true,
    properties: {
      "Boolean Const": true,
      "Integer Const": 10,
      "Number Const": 2.2,
      "String Const": "String-Constant",
      "String Const WIth Quotes": '"String "Const With" Quotes"',
      "String Int Const": 0,
    },
  });
  expect(
    events["Event With All Properties"].parse({ ...ALL_PROPERTIES }),
  ).toEqual({
    ok: true,
    properties: { ...ALL_PROPERTIES, requiredConst: "some-const-value" },
  });
});

test("an event without properties parses to an empty object", () => {
  expect(events["Event No Properties"].parse(undefined)).toEqual({
    ok: true,
    properties: {},
  });
  expect(events["Event With Optional Properties"].parse(undefined)).toEqual({
    ok: true,
    properties: {},
  });
});

test("every parse answers its own properties object, so one event never shares another's", () => {
  const input = { optionalString: "first" };
  const first = events["Event With Optional Properties"].parse(input);
  const second = events["Event With Optional Properties"].parse(input);

  const firstProperties = first.ok ? first.properties : null;
  const secondProperties = second.ok ? second.properties : null;

  expect(firstProperties).toStrictEqual({ optionalString: "first" });
  expect(secondProperties).toStrictEqual({ optionalString: "first" });
  expect(firstProperties).not.toBe(secondProperties);
  expect(firstProperties).not.toBe(input);
});

test("the registry is frozen, so a tracking plan cannot change after its names were checked", () => {
  expect(Object.isFrozen(events)).toBe(true);
});
