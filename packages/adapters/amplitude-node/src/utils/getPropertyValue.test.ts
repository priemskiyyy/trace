import { expect, test } from "vitest";

import { getPropertyValue } from "src/utils/getPropertyValue";

const nest = (objects: number, leaf: unknown) =>
  Array.from({ length: objects }).reduce<unknown>(
    (inner) => ({ a: inner }),
    leaf,
  );

test("a string of 1,024 characters goes as it is, and one of 1,025 goes whole as a truncated loss, since Amplitude cuts it", () => {
  const kept = "a".repeat(1_024);
  const long = "a".repeat(1_025);

  expect(getPropertyValue(kept, "properties.note", 2)).toStrictEqual({
    kept: [kept],
    losses: [],
  });
  expect(getPropertyValue(long, "properties.note", 2)).toStrictEqual({
    kept: [long],
    losses: [{ path: "properties.note", reason: "truncated" }],
  });
});

test("a number, a boolean and null go as they are", () => {
  expect(getPropertyValue(49.5, "properties.value", 2)).toStrictEqual({
    kept: [49.5],
    losses: [],
  });
  expect(getPropertyValue(false, "properties.trial", 2)).toStrictEqual({
    kept: [false],
    losses: [],
  });
  expect(getPropertyValue(null, "properties.coupon", 2)).toStrictEqual({
    kept: [null],
    losses: [],
  });
});

test("an object on Amplitude's 40th layer goes, and one past it is left out as an unsupported loss while the layers above it go", () => {
  expect(
    getPropertyValue(nest(39, "leaf"), "properties.deep", 2),
  ).toStrictEqual({ kept: [nest(39, "leaf")], losses: [] });
  expect(
    getPropertyValue(nest(40, "leaf"), "properties.deep", 2),
  ).toStrictEqual({
    kept: [nest(38, {})],
    losses: [
      {
        path: `properties.deep${".a".repeat(39)}`,
        reason: "unsupported",
      },
    ],
  });
});

test("a list keeps its items, leaving out only one nested too deep, which its index names", () => {
  expect(
    getPropertyValue(["a", { b: 1 }, ["c"]], "properties.list", 40),
  ).toStrictEqual({
    kept: [["a"]],
    losses: [
      { path: "properties.list.1", reason: "unsupported" },
      { path: "properties.list.2", reason: "unsupported" },
    ],
  });
});

test("a string Amplitude will cut inside objects and lists is named by its full path", () => {
  const long = "a".repeat(1_025);

  expect(
    getPropertyValue(
      { label: long, tags: ["b", long], exact: "a".repeat(1_024) },
      "properties.cart",
      2,
    ),
  ).toStrictEqual({
    kept: [{ label: long, tags: ["b", long], exact: "a".repeat(1_024) }],
    losses: [
      { path: "properties.cart.label", reason: "truncated" },
      { path: "properties.cart.tags.1", reason: "truncated" },
    ],
  });
});
