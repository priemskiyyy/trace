import { expect, test } from "vitest";

import { getIdentifyValue } from "src/utils/getIdentifyValue";

const nest = (objects: number, leaf: unknown) =>
  Array.from({ length: objects }).reduce<unknown>(
    (inner) => ({ a: inner }),
    leaf,
  );

const createKeys = (count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`k${index}`, index]),
  );

test("a value Identify takes goes as it is", () => {
  const value = {
    plan: "pro",
    seats: 12,
    trial: true,
    tags: ["beta", 2, { sku: "a" }],
  };

  expect(getIdentifyValue(value, "traits.profile", 2, false)).toStrictEqual({
    kept: [value],
    stripped: [],
  });
});

const stripped: {
  name: string;
  value: unknown;
  kept: unknown;
  paths: string[];
}[] = [
  {
    name: "inside an object",
    value: { score: null, name: "ada" },
    kept: { name: "ada" },
    paths: ["traits.value.score"],
  },
  {
    name: "inside an object in a list",
    value: [{ sku: "a", quantity: null }, { sku: "b" }],
    kept: [{ sku: "a" }, { sku: "b" }],
    paths: ["traits.value.0.quantity"],
  },
];

test.each(stripped)(
  "a null nested $name is stripped and its path named, and the rest of the value goes",
  ({ value, kept, paths }) => {
    expect(getIdentifyValue(value, "traits.value", 2, false)).toStrictEqual({
      kept: [kept],
      stripped: paths,
    });
  },
);

const refused: { name: string; value: unknown }[] = [
  {
    name: "a null in a list, shifting the rest",
    value: [null, "beta"],
  },
  { name: "a boolean in a list", value: [true, "beta"] },
  { name: "a list in a list", value: [[1, 2], 3] },
  {
    name: "an object null beside a refused part",
    value: { score: null, tags: [true] },
  },
];

test.each(refused)(
  "a value holding $name is refused whole, so no part of it is sent",
  ({ value }) => {
    expect(getIdentifyValue(value, "traits.value", 2, false)).toBe(null);
  },
);

test("an object of 1,000 keys goes, and one of 1,001 anywhere in a value refuses the whole value", () => {
  expect(
    getIdentifyValue({ big: createKeys(1_000) }, "traits.profile", 2, false),
  ).toStrictEqual({ kept: [{ big: createKeys(1_000) }], stripped: [] });
  expect(
    getIdentifyValue(
      { big: createKeys(1_001), name: "ada" },
      "traits.profile",
      2,
      false,
    ),
  ).toBe(null);
  expect(
    getIdentifyValue([createKeys(1_001), "ada"], "traits.list", 2, false),
  ).toBe(null);
});

test("an object on Amplitude's 40th layer goes, and one past it refuses the whole value", () => {
  expect(
    getIdentifyValue(nest(39, "leaf"), "traits.deep", 2, false),
  ).toStrictEqual({ kept: [nest(39, "leaf")], stripped: [] });
  expect(getIdentifyValue(nest(40, "leaf"), "traits.deep", 2, false)).toBe(
    null,
  );
});

test("a string of 1,024 characters goes, and one of 1,025 refuses the whole value wherever it sits, so no stored value is cut or sent in part", () => {
  const kept = "a".repeat(1_024);
  const long = "a".repeat(1_025);

  expect(getIdentifyValue(kept, "traits.note", 2, false)).toStrictEqual({
    kept: [kept],
    stripped: [],
  });
  expect(getIdentifyValue(long, "traits.note", 2, false)).toBe(null);
  expect(
    getIdentifyValue({ note: long, plan: "pro" }, "traits.profile", 2, false),
  ).toBe(null);
  expect(getIdentifyValue(["b", long], "traits.tags", 2, false)).toBe(null);
});
